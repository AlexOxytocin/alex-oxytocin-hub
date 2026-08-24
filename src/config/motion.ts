export const motionTokens = {
  duration: {
    instant: 80,
    fast: 180,
    normal: 350,
    slow: 600,
    crawl: 1000,
  },
  easing: {
    smooth: [0.22, 1, 0.36, 1] as const,
    sharp: [0.4, 0, 0.2, 1] as const,
    linear: [0, 0, 1, 1] as const,
  },
  distance: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 48,
  },
  scale: {
    subtle: 0.98,
    press: 0.95,
    pop: 1.04,
  },
  ambient: {
    ringCount: 5,
    phaseStep: 0.008,
    signalStroke: 'rgba(137, 169, 255, 0.38)',
    warmStroke: 'rgba(255, 180, 120, 0.24)',
  },
} as const;

export const motionPolicy = {
  mobileBreakpoint: 720,
  lowEndConcurrency: 4,
  maxDevicePixelRatio: 1.5,
  idleTimeout: 1200,
} as const;
