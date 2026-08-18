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

/** A numeric setting + an enabled flag. Used for all Filters tab sliders. */
export interface FilterSlider {
  readonly enabled: boolean;
  /** Value in the setting's natural unit (%, multiplier, etc.). */
  readonly value: number;
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
  },
};

/** Bounds for Filters sliders — used by the UI and by SettingsService setters. */
export const FILTER_BOUNDS = {
  brightness: { min: 25, max: 200, step: 5 },
  blueLight: { min: 0, max: 80, step: 5 },
  contrast: { min: 25, max: 200, step: 5 },
  gamma: { min: 0.5, max: 2.5, step: 0.1 },
} as const satisfies Record<keyof FilterSettings, { min: number; max: number; step: number }>;