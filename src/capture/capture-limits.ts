export const captureLimits = {
  deadlineMs: 12_000,
  responseBytes: 2 * 1024 * 1024,
  robotsBytes: 256 * 1024,
  textCharacters: 500_000,
  domElements: 20_000,
  lineCharacters: 160,
  redirects: 3,
  requestIntervalMs: 1_000,
} as const;

export const captureUserAgent = 'AnySearch/0.1';
