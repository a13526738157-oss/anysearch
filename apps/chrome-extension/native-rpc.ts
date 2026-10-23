export interface NativePort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export class NativeConnectionError extends Error {
  constructor() {
    super('Native connection unavailable');
  }
}

interface PendingRequest {
  resolve: (message: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 15_000;

export class NativeRpc {
  private port: NativePort | undefined;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly connect: () => NativePort;
  private readonly consumeDisconnectError: () => void;
  private readonly timeoutMs: number;

  constructor(
    connect: () => NativePort,
    consumeDisconnectError: () => void = () => {},
    timeoutMs = REQUEST_TIMEOUT_MS,
  ) {
    this.connect = connect;
    this.consumeDisconnectError = consumeDisconnectError;
    this.timeoutMs = timeoutMs;
  }

  request(message: { id: string }): Promise<unknown> {
    if (this.pending.has(message.id)) return Promise.reject(new NativeConnectionError());
    try {
      this.ensurePort();
    } catch {
      return Promise.reject(new NativeConnectionError());
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close(), this.timeoutMs);
      this.pending.set(message.id, { resolve, reject, timer });
      try {
        this.port!.postMessage(message);
      } catch {
        this.close();
      }
    });
  }

  close(): void {
    const port = this.port;
    this.port = undefined;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new NativeConnectionError());
    }
    this.pending.clear();
    try {
      port?.disconnect();
    } catch {
      // Chrome may have already closed the native port.
    }
  }

  private ensurePort(): void {
    if (this.port !== undefined) return;
    const port = this.connect();
    this.port = port;
    port.onMessage.addListener((message) => {
      if (this.port !== port || message === null || typeof message !== 'object') return;
      const requestId = (message as { id?: unknown }).id;
      if (typeof requestId !== 'string') return;
      const request = this.pending.get(requestId);
      if (request === undefined) return;
      this.pending.delete(requestId);
      clearTimeout(request.timer);
      request.resolve(message);
    });
    port.onDisconnect.addListener(() => {
      this.consumeDisconnectError();
      if (this.port === port) this.close();
    });
  }
}
