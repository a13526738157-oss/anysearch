import type { Readable, Writable } from 'node:stream';
import { NativeFrameDecoder, encodeNativeFrame } from './framing.ts';

export interface NativeSession {
  handle(request: unknown): object;
  close(): void;
}

export async function serveNativeSession(input: Readable, output: Writable, session: NativeSession): Promise<void> {
  const decoder = new NativeFrameDecoder();
  try {
    for await (const chunk of input) {
      if (!(chunk instanceof Uint8Array)) throw new Error('Invalid native input.');
      for (const request of decoder.push(chunk)) {
        const frame = encodeNativeFrame(session.handle(request));
        await new Promise<void>((resolve, reject) => {
          output.write(frame, (error) => { if (error) reject(error); else resolve(); });
        });
      }
    }
    decoder.finish();
  } finally {
    session.close();
  }
}
