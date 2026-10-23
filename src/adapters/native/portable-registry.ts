import { NATIVE_HOST_NAME } from '../../connectors/protocol.ts';
import { registryKey } from './registry-scripts.ts';

function quote(value: string): string { return `'${value.replaceAll("'", "''")}'`; }

export function portableRegistryScript(manifestPath: string, previousManifestPath: string | undefined,
  action: 'install' | 'uninstall' | 'rollback'): string {
  return `param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$keyPath = ${quote(registryKey)}
$manifestPath = ${quote(manifestPath)}
$previousManifestPath = ${previousManifestPath ? quote(previousManifestPath) : '$null'}
$action = ${quote(action)}
Write-Output '${action}: HKCU Registry32 NativeMessagingHosts/${NATIVE_HOST_NAME}'
Write-Output $manifestPath
if ($null -ne $previousManifestPath) { Write-Output ('Expected previous manifest: ' + $previousManifestPath) }
if (-not $Apply) { Write-Output 'Preview only. Review the exact manifest paths before using -Apply.'; return }

function Get-Registration {
  $current = $base.OpenSubKey($keyPath, $false)
  if ($null -eq $current) { return [pscustomobject]@{ Present = $false; Value = $null } }
  try {
    Assert-Key $current
    return [pscustomobject]@{ Present = $true; Value = $current.GetValue('', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
  } finally { $current.Dispose() }
}
function Assert-Key($current) {
  if ($current.ValueCount -ne 1 -or $current.SubKeyCount -ne 0 -or @($current.GetValueNames())[0] -cne '' -or
      $current.GetValueKind('') -ne [Microsoft.Win32.RegistryValueKind]::String) {
    throw 'Registration shape or value type differs. Refusing to change it.'
  }
}
function Open-MatchingKey([string]$expected) {
  $current = $base.OpenSubKey($keyPath, $true)
  if ($null -eq $current) { throw 'Registration changed concurrently.' }
  try {
    Assert-Key $current
    if ($current.GetValue('', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) -cne $expected) {
      throw 'Registration changed concurrently or does not match the reviewed value.'
    }
    return $current
  } catch { $current.Dispose(); throw }
}
function Assert-Current([string]$expected) {
  $state = Get-Registration
  if (-not $state.Present -or $state.Value -cne $expected) { throw 'Registration changed concurrently.' }
}
function Set-MatchingRegistration([string]$expected, [string]$replacement) {
  $current = Open-MatchingKey $expected
  try {
    Assert-Current $expected
    $current.SetValue('', $replacement, [Microsoft.Win32.RegistryValueKind]::String)
    $current.Flush()
  } finally { $current.Dispose() }
  Assert-Current $replacement
}
function Create-NewRegistration {
  if (-not ('AnySearchNativeRegistryCreate' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;
public static class AnySearchNativeRegistryCreate {
  [DllImport("advapi32.dll", CharSet = CharSet.Unicode, EntryPoint = "RegCreateKeyExW")]
  private static extern int CreateKey(IntPtr root, string path, uint reserved, string keyClass,
    uint options, uint access, IntPtr security, out SafeRegistryHandle handle, out uint disposition);
  public static RegistryKey Create(string path) {
    SafeRegistryHandle handle;
    uint disposition;
    int error = CreateKey(new IntPtr(unchecked((int)0x80000001)), path, 0, null, 0,
      0x2021F, IntPtr.Zero, out handle, out disposition);
    if (error != 0) { if (handle != null) handle.Dispose(); throw new InvalidOperationException("Registry create failed."); }
    if (disposition != 1) { handle.Dispose(); throw new InvalidOperationException("Registration appeared concurrently."); }
    return RegistryKey.FromHandle(handle, RegistryView.Registry32);
  }
}
'@
  }
  $current = [AnySearchNativeRegistryCreate]::Create($keyPath)
  try {
    if ($current.ValueCount -ne 0 -or $current.SubKeyCount -ne 0) { throw 'New registration changed concurrently.' }
    $current.SetValue('', $manifestPath, [Microsoft.Win32.RegistryValueKind]::String)
    $current.Flush()
  } finally { $current.Dispose() }
  Assert-Current $manifestPath
}

$base = $null
$mutex = $null
$held = $false
try {
  $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $mutex = [System.Threading.Mutex]::new($false, ('Global\\AnySearch.NativeMessaging.Registry32.' + $sid))
  try { $held = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $held = $true }
  if (-not $held) { throw 'Another AnySearch registration operation is active.' }
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry32)
  $state = Get-Registration
  if ($action -eq 'install') {
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'New native host manifest is missing.' }
    if ($null -eq $previousManifestPath) {
      if ($state.Present) { throw 'Registration exists; an exact reviewed previous manifest is required.' }
      Create-NewRegistration
    } else {
      if (-not $state.Present -or $state.Value -cne $previousManifestPath) { throw 'Expected previous registration does not match.' }
      Set-MatchingRegistration $previousManifestPath $manifestPath
    }
    Write-Output 'Registered only the reviewed HKCU Registry32 host. Pairing and grants were not changed.'
  } elseif ($action -eq 'uninstall') {
    if (-not $state.Present) { Write-Output 'No registration exists. Nothing changed.'; return }
    $current = Open-MatchingKey $manifestPath
    $current.Dispose()
    Assert-Current $manifestPath
    $base.DeleteSubKey($keyPath, $false)
    if ((Get-Registration).Present) { throw 'Registration changed concurrently after removal.' }
    Write-Output 'Removed only this matching registration. Program, data, extension and grants remain unchanged.'
  } else {
    if ($null -eq $previousManifestPath) { throw 'Rollback requires an explicitly reviewed previous manifest.' }
    if (-not $state.Present -or $state.Value -cne $manifestPath) { throw 'Current registration does not match this setup.' }
    Set-MatchingRegistration $manifestPath $previousManifestPath
    Write-Output 'Restored only the explicit previous manifest path. No data or grants were restored.'
  }
} finally {
  if ($null -ne $base) { $base.Dispose() }
  if ($held) { $mutex.ReleaseMutex() }
  if ($null -ne $mutex) { $mutex.Dispose() }
}
`;
}
