/**
 * Display + Filters settings shape.
 *
 * Single source of truth — both the Viewer's Quick Actions modal and the
 * Preferences page read from / write to this. Keep enums flat and small;
 * discriminated unions only when a setting has genuinely different shapes.
 *
 * When a setting gets a "per-book" override later, swap `ReadingDirection`
 * from a plain alias to a `{ global, perBook? }` discriminated union.
 * Don't preempt — the issue scope locks it as global-only for v1.
 */

export type ReadingDirection = 'ltr' | 'rtl';

export type ScreenOrientation =
  | 'auto'
  | 'portrait'
  | 'landscape'
  | 'portrait-inverted'
  | 'landscape-inverted'
  | 'default';

export type PageLayout =
  | 'default'
  | 'auto-single'
  | 'auto-dual'
  | 'auto-switch';

export type InterfaceTheme = 'auto' | 'light' | 'dark';

export type ViewerMode = 'paged' | 'vertical-scroll' | 'horizontal-scroll';

export type PageTransition = 'none' | 'slide-horizontal' | 'slide-vertical' | 'page-curl';

/**
 * Sampling method for image upscaling/downscaling. Mapped to CSS
 * `image-rendering` where the browser supports it; higher-quality
 * entries (bicubic, lanczos3) are stored but inert until a WebGL
 * filter lands — only nearest-neighbor visibly differs today.
 */
export type ImageSmoothMethod =
  | 'nearest-neighbor'
  | 'averaging'
  | 'bilinear'
  | 'bicubic'
  | 'lanczos3';

/** A numeric setting + an enabled flag. Used for all slider Filters. */
export interface FilterSlider {
  readonly enabled: boolean;
  /** Value in the setting's natural unit (%, multiplier, etc.). */
  readonly value: number;
}

/** Discrete-method setting + an enabled flag. Image smooth is the only
 *  filter that takes an enum (sampling method) instead of a number. */
export interface FilterMethod {
  readonly enabled: boolean;
  readonly method: ImageSmoothMethod;
}

export interface DisplaySettings {
  readonly readingDirection: ReadingDirection;
  readonly screenOrientation: ScreenOrientation;
  readonly pageLayout: PageLayout;
  readonly interfaceTheme: InterfaceTheme;
  readonly viewerMode: ViewerMode;
  readonly pageTransition: PageTransition;
}

export interface FilterSettings {
  readonly brightness: FilterSlider;
  readonly blueLight: FilterSlider;
  readonly contrast: FilterSlider;
  readonly gamma: FilterSlider;
  readonly grayscale: FilterSlider;
  readonly sepia: FilterSlider;
  readonly sharpen: FilterSlider;
  readonly blur: FilterSlider;
  readonly grain: FilterSlider;
  readonly imageSmooth: FilterMethod;
}

export interface AppSettings {
  readonly display: DisplaySettings;
  readonly filters: FilterSettings;
}

/** Defaults — keep in one place so the service, tests, and reset share them. */
export const DEFAULT_SETTINGS: AppSettings = {
  display: {
    readingDirection: 'ltr',
    screenOrientation: 'auto',
    pageLayout: 'default',
    interfaceTheme: 'auto',
    viewerMode: 'paged',
    pageTransition: 'none',
  },
  filters: {
    brightness: { enabled: false, value: 100 },
    blueLight: { enabled: false, value: 0 },
    contrast: { enabled: false, value: 100 },
    gamma: { enabled: false, value: 1.0 },
    grayscale: { enabled: false, value: 0 },
    sepia: { enabled: false, value: 0 },
    sharpen: { enabled: false, value: 0 },
    blur: { enabled: false, value: 0 },
    grain: { enabled: false, value: 0 },
    imageSmooth: { enabled: false, method: 'bilinear' },
  },
};

/** Bounds for Filters sliders — used by the UI and by SettingsService setters. */
export const FILTER_BOUNDS = {
  brightness: { min: 25, max: 200, step: 5 },
  blueLight: { min: 0, max: 80, step: 5 },
  contrast: { min: 25, max: 200, step: 5 },
  gamma: { min: 0.5, max: 2.5, step: 0.1 },
  grayscale: { min: 0, max: 100, step: 5 },
  sepia: { min: 0, max: 100, step: 5 },
  sharpen: { min: 0, max: 10, step: 0.5 },
  blur: { min: 0, max: 20, step: 1 },
  grain: { min: 0, max: 100, step: 5 },
} as const satisfies Record<
  Exclude<keyof FilterSettings, 'imageSmooth'>,
  { min: number; max: number; step: number }
>;
