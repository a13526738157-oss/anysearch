import { endianness } from 'node:os';
import { SYNC_LIMITS } from '../../connectors/protocol.ts';

const littleEndian = endianness() === 'LE';
const headerBytes = 4;

export class NativeFrameError extends Error {
  constructor() {
    super('Invalid native message frame.');
    this.name = 'NativeFrameError';
  }
}

export class NativeFrameDecoder {
  private readonly header = Buffer.alloc(headerBytes);
  private headerOffset = 0;
  private body: Buffer | undefined;
  private bodyOffset = 0;
  private failed = false;

  *push(chunk: Uint8Array): Generator<unknown> {
    if (this.failed) throw new NativeFrameError();
    let offset = 0;
    try {
      while (offset < chunk.byteLength) {
        if (!this.body) {
          const count = Math.min(headerBytes - this.headerOffset, chunk.byteLength - offset);
          this.header.set(chunk.subarray(offset, offset + count), this.headerOffset);
          this.headerOffset += count;
          offset += count;
          if (this.headerOffset < headerBytes) continue;
          const length = littleEndian ? this.header.readUInt32LE() : this.header.readUInt32BE();
          if (length === 0 || length > SYNC_LIMITS.maxFrameBytes) throw new NativeFrameError();
          this.body = Buffer.allocUnsafe(length);
          this.bodyOffset = 0;
        }

        const count = Math.min(this.body.byteLength - this.bodyOffset, chunk.byteLength - offset);
        this.body.set(chunk.subarray(offset, offset + count), this.bodyOffset);
        this.bodyOffset += count;
        offset += count;
        if (this.bodyOffset < this.body.byteLength) continue;

        const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(this.body);
        const message: unknown = JSON.parse(json);
        this.body = undefined;
        this.headerOffset = 0;
        this.bodyOffset = 0;
        yield message;
      }
    } catch {
      this.failed = true;
      this.body = undefined;
      throw new NativeFrameError();
    }
  }

  finish(): void {
    if (this.failed || this.headerOffset !== 0 || this.body) throw new NativeFrameError();
  }
}

export function encodeNativeFrame(message: unknown): Buffer {
  try {
    const json = JSON.stringify(message);
    if (json === undefined) throw new NativeFrameError();
    const body = Buffer.from(json, 'utf8');
    if (body.byteLength === 0 || body.byteLength > SYNC_LIMITS.maxFrameBytes) throw new NativeFrameError();
    const frame = Buffer.allocUnsafe(headerBytes + body.byteLength);
    if (littleEndian) frame.writeUInt32LE(body.byteLength);
    else frame.writeUInt32BE(body.byteLength);
    body.copy(frame, headerBytes);
    return frame;
  } catch {
    throw new NativeFrameError();
  }
}
