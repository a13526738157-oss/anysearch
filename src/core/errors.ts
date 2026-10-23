export class ServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
  }
}

export function requireValue(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new ServiceError(code, message);
}

