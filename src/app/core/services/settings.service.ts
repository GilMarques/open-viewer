import { Injectable, effect, signal } from '@angular/core';

import {
  DEFAULT_SETTINGS,
  FILTER_BOUNDS,
  type AppSettings,
  type DisplaySettings,
  type FilterSettings,
  type FilterSlider,
  type InterfaceTheme,
  type PageLayout,
  type PageTransition,
  type ReadingDirection,
  type ScreenOrientation,
  type ViewerMode,
} from '../models/settings.model';

const STORAGE_KEY = 'openviewer:settings:v1';

/**
 * Central settings store. Single source of truth for Display + Filters.
 *
 * Persistence: a tiny `effect()` mirrors the signal to `localStorage` on
 * every change. Hydration happens once on construction. Both are no-ops
 * during SSR or when localStorage is unavailable (private mode, Capacitor
 * WebView quirks) — we degrade silently rather than crash.
 *
 * Setters clamp numeric sliders to their declared bounds. Don't bypass
 * the setters — they are the only path that touches storage.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly _settings = signal<AppSettings>(this.load());
  public readonly settings = this._settings.asReadonly();

  constructor() {
    effect(() => {
      const next = this._settings();
      this.save(next);
    });
  }

  // ──────────────────────── Display setters ────────────────────────

  public setReadingDirection(value: ReadingDirection): void {
    this._settings.update((s) => ({ ...s, display: { ...s.display, readingDirection: value } }));
  }

  public setScreenOrientation(value: ScreenOrientation): void {
    this._settings.update((s) => ({ ...s, display: { ...s.display, screenOrientation: value } }));
  }

  public setPageLayout(value: PageLayout): void {
    this._settings.update((s) => ({ ...s, display: { ...s.display, pageLayout: value } }));
  }

  public setInterfaceTheme(value: InterfaceTheme): void {
    this._settings.update((s) => ({ ...s, display: { ...s.display, interfaceTheme: value } }));
  }

  public setViewerMode(value: ViewerMode): void {
    this._settings.update((s) => ({ ...s, display: { ...s.display, viewerMode: value } }));
  }

  public setPageTransition(value: PageTransition): void {
    this._settings.update((s) => ({ ...s, display: { ...s.display, pageTransition: value } }));
  }

  // ──────────────────────── Filter setters ────────────────────────

  public setFilter<K extends keyof FilterSettings>(
    key: K,
    enabled: boolean,
    value: number,
  ): void {
    const bounds = FILTER_BOUNDS[key];
    const clamped = Math.min(bounds.max, Math.max(bounds.min, value));
    const next: FilterSlider = { enabled, value: clamped };
    this._settings.update((s) => ({
      ...s,
      filters: { ...s.filters, [key]: next },
    }));
  }

  // ──────────────────────── Reset ────────────────────────

  public resetToDefaults(): void {
    this._settings.set(DEFAULT_SETTINGS);
  }

  // ──────────────────────── Persistence ────────────────────────

  private load(): AppSettings {
    if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(raw) as unknown;
      return this.validate(parsed);
    } catch {
      // Corrupt or unreadable. Fall back to defaults — don't crash the app.
      return DEFAULT_SETTINGS;
    }
  }

  private save(s: AppSettings): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Quota exceeded or storage disabled. Silent: settings live in memory.
    }
  }

  /**
   * Defensive shape check on parsed JSON. If the stored object is missing
   * keys or has wrong types, fall back to defaults for those keys rather
   * than rejecting the whole payload. Tolerant of older versions.
   */
  private validate(input: unknown): AppSettings {
    const fallback = DEFAULT_SETTINGS;
    if (typeof input !== 'object' || input === null) return fallback;
    const i = input as { display?: Record<string, unknown>; filters?: Record<string, unknown> };

    const d = (i.display ?? {}) as Record<string, unknown>;
    const display: DisplaySettings = {
      readingDirection: this.pickEnum(d['readingDirection'], ['ltr', 'rtl'], fallback.display.readingDirection),
      screenOrientation: this.pickEnum(d['screenOrientation'], ['auto', 'portrait', 'landscape', 'portrait-inverted', 'landscape-inverted', 'default'], fallback.display.screenOrientation),
      pageLayout: this.pickEnum(d['pageLayout'], ['default', 'auto-single', 'auto-dual', 'auto-switch'], fallback.display.pageLayout),
      interfaceTheme: this.pickEnum(d['interfaceTheme'], ['auto', 'light', 'dark'], fallback.display.interfaceTheme),
      viewerMode: this.pickEnum(d['viewerMode'], ['paged', 'vertical-scroll', 'horizontal-scroll'], fallback.display.viewerMode),
      pageTransition: this.pickEnum(d['pageTransition'], ['none', 'slide-horizontal', 'slide-vertical', 'page-curl'], fallback.display.pageTransition),
    };

    const f = (i.filters ?? {}) as Record<string, unknown>;
    const filters: FilterSettings = {
      brightness: this.pickFilter(f['brightness'], fallback.filters.brightness, FILTER_BOUNDS.brightness),
      blueLight: this.pickFilter(f['blueLight'], fallback.filters.blueLight, FILTER_BOUNDS.blueLight),
      contrast: this.pickFilter(f['contrast'], fallback.filters.contrast, FILTER_BOUNDS.contrast),
      gamma: this.pickFilter(f['gamma'], fallback.filters.gamma, FILTER_BOUNDS.gamma),
    };

    return { display, filters };
  }

  private pickEnum<T extends string>(
    raw: unknown,
    allowed: readonly T[],
    fallback: T,
  ): T {
    return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
      ? (raw as T)
      : fallback;
  }

  private pickFilter(
    raw: unknown,
    fallback: FilterSlider,
    bounds: { min: number; max: number },
  ): FilterSlider {
    if (typeof raw !== 'object' || raw === null) return fallback;
    const r = raw as { enabled?: unknown; value?: unknown };
    return {
      enabled: typeof r.enabled === 'boolean' ? r.enabled : fallback.enabled,
      value: typeof r.value === 'number'
        ? Math.min(bounds.max, Math.max(bounds.min, r.value))
        : fallback.value,
    };
  }
}