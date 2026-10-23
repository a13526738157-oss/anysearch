export interface DesktopActivationStatus {
  supported: boolean;
  service: 'starting' | 'ready' | 'unavailable';
  doubleShift: {
    enabled: boolean;
    state: 'disabled' | 'starting' | 'ready' | 'unavailable';
  };
  focusReturn: { state: 'starting' | 'ready' | 'unavailable' };
}

export function parseDoubleShiftEnabled(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('INVALID_ACTIVATION_SETTING');
  return value;
}
