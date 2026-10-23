using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace AnySearch
{
    public static class NativeActivation
    {
        private const int WhKeyboardLl = 13;
        private const uint WmKeyDown = 0x0100, WmKeyUp = 0x0101;
        private const uint WmSysKeyDown = 0x0104, WmSysKeyUp = 0x0105;
        private const uint WmCommand = 0x8001, WmToggle = 0x8002, WmQuit = 0x0012, WmTimer = 0x0113;
        private const uint InjectedFlags = 0x12;
        private const uint ProcessSynchronize = 0x00100000, ProcessQueryLimited = 0x1000;
        private const uint WaitTimeout = 0x00000102;
        private const int MinTapMs = 15, MaxTapMs = 220, MaxGapMs = 300, MaxCommandLength = 24, MaxPendingCommands = 16;
        private const int FocusTargetMaxAgeMs = 300000;
        private static readonly HookProc Callback = KeyboardEvent;
        private static readonly Stopwatch Clock = Stopwatch.StartNew();
        private static IntPtr hook = IntPtr.Zero;
        private static IntPtr parent = IntPtr.Zero;
        private static uint parentPid, messageThread;
        private static volatile bool stopping, enabled;
        private static int pendingCommands, togglePending;
        private static uint shiftHeld, modifiers, activeShift;
        private static long tapStart, firstRelease = -1;
        private static FocusTarget target;

        public static void Run(int desktopProcessId)
        {
            if (desktopProcessId <= 0) { Emit("unavailable"); return; }
            parentPid = (uint)desktopProcessId;
            try
            {
                parent = OpenProcess(ProcessSynchronize, false, parentPid);
                if (parent == IntPtr.Zero || WaitForSingleObject(parent, 0) != WaitTimeout)
                { Emit("unavailable"); return; }
                messageThread = GetCurrentThreadId();
                Message message;
                PeekMessage(out message, IntPtr.Zero, 0, 0, 0);
                UIntPtr timer = SetTimer(IntPtr.Zero, UIntPtr.Zero, 500, IntPtr.Zero);
                if (timer == UIntPtr.Zero) { Emit("unavailable"); return; }
                try
                {
                    Thread input = new Thread(ReadCommands);
                    input.IsBackground = true;
                    input.Start();
                    if (!Emit("ready")) return;
                    while (!stopping)
                    {
                        int result = GetMessage(out message, IntPtr.Zero, 0, 0);
                        if (result <= 0) break;
                        if (message.Id == WmCommand)
                        {
                            Interlocked.Decrement(ref pendingCommands);
                            HandleCommand(message.WParam.ToUInt32());
                        }
                        else if (message.Id == WmToggle)
                        {
                            Interlocked.Exchange(ref togglePending, 0);
                            if (enabled && !stopping) Emit("toggle");
                        }
                        else if (message.Id == WmTimer && message.WParam == timer)
                        {
                            if (WaitForSingleObject(parent, 0) != WaitTimeout) RequestStop();
                            if (target != null && Clock.ElapsedMilliseconds - target.CapturedAt > FocusTargetMaxAgeMs) ClearTarget();
                        }
                    }
                }
                finally { KillTimer(IntPtr.Zero, timer); }
            }
            catch { Emit("unavailable"); }
            finally
            {
                stopping = true;
                DisableHook();
                ClearTarget();
                if (parent != IntPtr.Zero) { CloseHandle(parent); parent = IntPtr.Zero; }
            }
        }

        private static void ReadCommands()
        {
            try
            {
                StringBuilder line = new StringBuilder(MaxCommandLength);
                Stream input = Console.OpenStandardInput();
                int value;
                while (!stopping && (value = input.ReadByte()) >= 0)
                {
                    if (value == 10)
                    {
                        string command = line.ToString();
                        line.Length = 0;
                        uint code = command == "enable" ? 1u : command == "disable" ? 2u : command == "capture" ? 3u
                            : command == "restore" ? 4u : command == "close" ? 5u : 0u;
                        if (code == 0 || Interlocked.Increment(ref pendingCommands) > MaxPendingCommands
                            || !PostThreadMessage(messageThread, WmCommand, new UIntPtr(code), IntPtr.Zero)) break;
                    }
                    else if (value >= 97 && value <= 122 && line.Length < MaxCommandLength) line.Append((char)value);
                    else break;
                }
            }
            catch { /* Input failures never emit input or exception text. */ }
            finally { RequestStop(); }
        }

        private static void HandleCommand(uint command)
        {
            if (stopping) return;
            switch (command)
            {
                case 1:
                    if (!EnableHook()) { Emit("unavailable"); RequestStop(); }
                    else Emit("enabled");
                    break;
                case 2:
                    if (!DisableHook()) { Emit("unavailable"); RequestStop(); }
                    else Emit("disabled");
                    break;
                case 3: Emit(CaptureFocus() ? "captured" : "capture-unavailable"); break;
                case 4: Emit(RestoreFocus() ? "restored" : "restore-unavailable"); break;
                case 5: DisableHook(); ClearTarget(); Emit("closed"); RequestStop(); break;
                default: Emit("unavailable"); RequestStop(); break;
            }
        }

        private static bool EnableHook()
        {
            if (enabled && hook != IntPtr.Zero) return true;
            ResetGesture();
            hook = SetWindowsHookEx(WhKeyboardLl, Callback, GetModuleHandle(null), 0);
            if (hook == IntPtr.Zero) return false;
            // Snapshot only modifier occupancy before entering the callback, never character state.
            modifiers = 0;
            uint[] keys = { 0xA2, 0xA3, 0xA4, 0xA5, 0x5B, 0x5C };
            for (int index = 0; index < keys.Length; index++)
                if ((GetAsyncKeyState((int)keys[index]) & 0x8000) != 0) modifiers |= 1u << index;
            shiftHeld = ((GetAsyncKeyState(0xA0) & 0x8000) != 0 ? 1u : 0u)
                | ((GetAsyncKeyState(0xA1) & 0x8000) != 0 ? 2u : 0u);
            enabled = true;
            return true;
        }

        private static bool DisableHook()
        {
            enabled = false;
            IntPtr previous = Interlocked.Exchange(ref hook, IntPtr.Zero);
            return previous == IntPtr.Zero || UnhookWindowsHookEx(previous);
        }

        private static IntPtr KeyboardEvent(int code, UIntPtr wParam, IntPtr lParam)
        {
            if (code == 0 && enabled && !stopping)
            {
                try
                {
                    // KBDLLHOOKSTRUCT: read only vkCode and flags, not scan/time/extra data.
                    uint key = unchecked((uint)Marshal.ReadInt32(lParam, 0));
                    uint flags = unchecked((uint)Marshal.ReadInt32(lParam, 8));
                    uint message = wParam.ToUInt32();
                    bool down = message == WmKeyDown || message == WmSysKeyDown;
                    bool up = message == WmKeyUp || message == WmSysKeyUp;
                    if (!down && !up) ResetGesture();
                    else if (key == 0xA0 || key == 0xA1)
                    {
                        if ((flags & (InjectedFlags | 0x20u)) != 0) ResetGesture();
                        else ProcessShift(key == 0xA0 ? 1u : 2u, down);
                    }
                    else
                    {
                        uint modifier = ModifierMask(key);
                        if (down) modifiers |= modifier;
                        else modifiers &= ~modifier;
                        ResetGesture();
                    }
                }
                catch { ResetGesture(); }
            }
            return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
        }

        private static uint ModifierMask(uint key)
        {
            switch (key)
            {
                case 0xA2: return 1; case 0xA3: return 2; case 0x11: return 3;
                case 0xA4: return 4; case 0xA5: return 8; case 0x12: return 12;
                case 0x5B: return 16; case 0x5C: return 32; default: return 0;
            }
        }

        private static void ProcessShift(uint bit, bool down)
        {
            long now = Clock.ElapsedMilliseconds;
            if (down)
            {
                uint previous = shiftHeld;
                shiftHeld |= bit;
                if (previous != 0 || modifiers != 0) { ResetGesture(); return; }
                if (firstRelease >= 0 && now - firstRelease > MaxGapMs) firstRelease = -1;
                activeShift = bit;
                tapStart = now;
                return;
            }
            bool wasHeld = (shiftHeld & bit) != 0;
            shiftHeld &= ~bit;
            long duration = now - tapStart;
            if (!wasHeld || activeShift != bit || shiftHeld != 0 || modifiers != 0
                || duration < MinTapMs || duration > MaxTapMs) { ResetGesture(); return; }
            activeShift = 0;
            if (firstRelease >= 0 && tapStart - firstRelease <= MaxGapMs)
            {
                ResetGesture();
                if (Interlocked.CompareExchange(ref togglePending, 1, 0) == 0
                    && !PostThreadMessage(messageThread, WmToggle, UIntPtr.Zero, IntPtr.Zero))
                    Interlocked.Exchange(ref togglePending, 0);
            }
            else firstRelease = now;
        }

        private static void ResetGesture() { activeShift = 0; tapStart = 0; firstRelease = -1; }

        private static bool CaptureFocus()
        {
            ClearTarget();
            IntPtr window = GetForegroundWindow();
            uint pid;
            uint thread = GetWindowThreadProcessId(window, out pid);
            if (!EligibleWindow(window) || thread == 0 || pid == parentPid || pid == GetCurrentProcessId()) return false;
            IntPtr process = OpenProcess(ProcessSynchronize | ProcessQueryLimited, false, pid);
            if (process == IntPtr.Zero) return false;
            FileTime created, exited, kernel, user;
            if (WaitForSingleObject(process, 0) != WaitTimeout || !GetProcessTimes(process, out created, out exited, out kernel, out user))
            { CloseHandle(process); return false; }
            uint currentPid;
            if (GetForegroundWindow() != window || GetWindowThreadProcessId(window, out currentPid) != thread || currentPid != pid)
            { CloseHandle(process); return false; }
            target = new FocusTarget { Window = window, Process = process, Pid = pid, Thread = thread,
                Created = created, CapturedAt = Clock.ElapsedMilliseconds };
            return true;
        }

        private static bool RestoreFocus()
        {
            FocusTarget saved = target;
            target = null;
            if (saved == null) return false;
            try
            {
                uint foregroundPid, currentPid;
                GetWindowThreadProcessId(GetForegroundWindow(), out foregroundPid);
                FileTime created, exited, kernel, user;
                if (foregroundPid != parentPid || Clock.ElapsedMilliseconds - saved.CapturedAt > FocusTargetMaxAgeMs
                    || !EligibleWindow(saved.Window)
                    || GetWindowThreadProcessId(saved.Window, out currentPid) != saved.Thread || currentPid != saved.Pid
                    || WaitForSingleObject(saved.Process, 0) != WaitTimeout
                    || !GetProcessTimes(saved.Process, out created, out exited, out kernel, out user)
                    || created.Low != saved.Created.Low || created.High != saved.Created.High) return false;
                // No input attachment, injection, window reveal, or foreground restriction bypass.
                return SetForegroundWindow(saved.Window) && GetForegroundWindow() == saved.Window;
            }
            finally { CloseHandle(saved.Process); }
        }

        private static bool EligibleWindow(IntPtr window)
        { return window != IntPtr.Zero && IsWindow(window) && IsWindowVisible(window) && !IsIconic(window); }

        private static void ClearTarget()
        {
            FocusTarget saved = target;
            target = null;
            if (saved != null) CloseHandle(saved.Process);
        }

        private static void RequestStop()
        {
            stopping = true;
            DisableHook();
            if (messageThread != 0) PostThreadMessage(messageThread, WmQuit, UIntPtr.Zero, IntPtr.Zero);
        }

        private static bool Emit(string code)
        {
            try { Console.Out.WriteLine(code); Console.Out.Flush(); return true; }
            catch { RequestStop(); return false; }
        }

        private sealed class FocusTarget
        {
            public IntPtr Window, Process;
            public uint Pid, Thread;
            public FileTime Created;
            public long CapturedAt;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct FileTime { public uint Low, High; }
        [StructLayout(LayoutKind.Sequential)]
        private struct Point { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)]
        private struct Message
        {
            public IntPtr Window;
            public uint Id;
            public UIntPtr WParam;
            public IntPtr LParam;
            public uint Time;
            public Point Position;
            public uint Private;
        }
        private delegate IntPtr HookProc(int code, UIntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll", EntryPoint = "SetWindowsHookExW", SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int id, HookProc callback, IntPtr module, uint thread);
        [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hookHandle);
        [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hookHandle, int code, UIntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
        [DllImport("user32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool PostThreadMessage(uint thread, uint message, UIntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] private static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
        [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint remove);
        [DllImport("user32.dll")] private static extern UIntPtr SetTimer(IntPtr window, UIntPtr timer, uint milliseconds, IntPtr callback);
        [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool KillTimer(IntPtr window, UIntPtr timer);
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
        [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsWindow(IntPtr window);
        [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsWindowVisible(IntPtr window);
        [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool IsIconic(IntPtr window);
        [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool SetForegroundWindow(IntPtr window);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr GetModuleHandle(string name);
        [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
        [DllImport("kernel32.dll")] private static extern uint GetCurrentProcessId();
        [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr OpenProcess(uint access, bool inherit, uint process);
        [DllImport("kernel32.dll")] private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
        [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetProcessTimes(IntPtr process, out FileTime created, out FileTime exited, out FileTime kernel, out FileTime user);
    }
}
