import { ServiceError } from '../core/errors.ts';

export function captureError(code: string): ServiceError {
  return new ServiceError(code, 'Public page capture could not be completed.');
}

export function checkSignal(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason instanceof ServiceError ? signal.reason : captureError('CAPTURE_CANCELLED');
  }
}

export async function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  checkSignal(signal);
  return new Promise<T>((resolve, reject) => {
    const aborted = (): void => {
      try { checkSignal(signal); } catch (error) { reject(error); }
    };
    signal.addEventListener('abort', aborted, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}
