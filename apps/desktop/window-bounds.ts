export interface WindowBounds { x: number; y: number; width: number; height: number }

interface ResizeTarget {
  isResizable(): boolean;
  setResizable(value: boolean): void;
  setBounds(bounds: WindowBounds): void;
}

export function applyProgrammaticBounds(window: ResizeTarget, bounds: WindowBounds): void {
  const wasResizable = window.isResizable();
  // Verified workaround for fixed acrylic windows on the current Windows host.
  try {
    if (!wasResizable) window.setResizable(true);
    window.setBounds(bounds);
  } finally {
    if (!wasResizable) window.setResizable(false);
  }
}

export function centeredWindowBounds(area: WindowBounds, size: Pick<WindowBounds, 'width' | 'height'>): WindowBounds {
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);
  const remainingHeight = area.height - height;
  return {
    x: area.x + Math.round((area.width - width) / 2),
    y: area.y + Math.min(remainingHeight, Math.max(24, Math.round(remainingHeight / 3))),
    width, height,
  };
}
