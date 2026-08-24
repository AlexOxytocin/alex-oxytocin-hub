import { motionPolicy, motionTokens } from '../config/motion';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function isLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.hardwareConcurrency > 0
    && navigator.hardwareConcurrency <= motionPolicy.lowEndConcurrency;
}

export function isCompactViewport(): boolean {
  return typeof window === 'undefined'
    || window.matchMedia(`(max-width: ${motionPolicy.mobileBreakpoint}px)`).matches;
}

export function shouldAnimate({ essential = false } = {}): boolean {
  if (prefersReducedMotion()) return false;
  if (!essential && (isLowEndDevice() || isCompactViewport())) return false;
  return true;
}

export function scheduleMotionStart(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const browserWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof browserWindow.requestIdleCallback === 'function') {
    const handle = browserWindow.requestIdleCallback(callback, { timeout: motionPolicy.idleTimeout });
    return () => browserWindow.cancelIdleCallback?.(handle);
  }

  const handle = globalThis.setTimeout(callback, motionTokens.duration.instant);
  return () => globalThis.clearTimeout(handle);
}
