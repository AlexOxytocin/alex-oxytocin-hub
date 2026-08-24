import { motionPolicy, motionTokens } from '../config/motion';
import { scheduleMotionStart, shouldAnimate } from './motion-policy';

const initialized = new WeakSet<HTMLElement>();

function initialize(root: HTMLElement): void {
  if (initialized.has(root)) return;
  initialized.add(root);

  const canvas = root.querySelector<HTMLCanvasElement>('[data-ambient-canvas]');
  const context = canvas?.getContext('2d');
  if (!canvas || !context || !shouldAnimate()) {
    root.dataset.motionState = 'static';
    return;
  }

  let frame = 0;
  let phase = 0;
  let inViewport = false;
  let disposed = false;

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, motionPolicy.maxDevicePixelRatio);
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const draw = () => {
    if (disposed || document.hidden || !inViewport) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;

    for (let ring = 0; ring < motionTokens.ambient.ringCount; ring += 1) {
      const offset = ring * motionTokens.distance.lg;
      const pulse = Math.sin(phase + ring * 0.7) * motionTokens.distance.sm;
      context.beginPath();
      context.strokeStyle = ring % 2 === 0
        ? motionTokens.ambient.signalStroke
        : motionTokens.ambient.warmStroke;
      context.ellipse(
        width * 0.5,
        height * 0.5,
        Math.max(20, width * 0.2 + offset + pulse),
        Math.max(18, height * 0.16 + offset * 0.72 + pulse),
        phase * 0.08 + ring * 0.14,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }

    phase += motionTokens.ambient.phaseStep;
    frame = window.requestAnimationFrame(draw);
  };

  const pause = () => {
    window.cancelAnimationFrame(frame);
    frame = 0;
    root.dataset.motionState = 'paused';
  };

  const resume = () => {
    if (document.hidden || !inViewport || disposed || frame) return;
    root.dataset.motionState = 'active';
    frame = window.requestAnimationFrame(draw);
  };

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    inViewport = Boolean(entry?.isIntersecting);
    if (inViewport) resume(); else pause();
  }, { rootMargin: '120px' });

  const resizeObserver = new ResizeObserver(resize);
  const onVisibilityChange = () => (document.hidden ? pause() : resume());
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compactViewportQuery = window.matchMedia(`(max-width: ${motionPolicy.mobileBreakpoint}px)`);
  const onPolicyChange = () => {
    if (!shouldAnimate()) {
      pause();
      root.dataset.motionState = 'static';
      return;
    }
    resize();
    resume();
  };

  resize();
  visibilityObserver.observe(root);
  resizeObserver.observe(root);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotionQuery.addEventListener('change', onPolicyChange);
  compactViewportQuery.addEventListener('change', onPolicyChange);

  window.addEventListener('pagehide', () => {
    disposed = true;
    pause();
    visibilityObserver.disconnect();
    resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotionQuery.removeEventListener('change', onPolicyChange);
    compactViewportQuery.removeEventListener('change', onPolicyChange);
  }, { once: true });
}

export function startAmbientFields(): void {
  if (typeof document === 'undefined') return;
  const cancel = scheduleMotionStart(() => {
    document.querySelectorAll<HTMLElement>('[data-motion-kind="canvas"]').forEach(initialize);
  });
  window.addEventListener('pagehide', cancel, { once: true });
}
