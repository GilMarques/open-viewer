import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular/standalone';

import { buildKingdomSample } from '../../core/debug/sample-books';
import type { FilterSettings } from '../../core/models/settings.model';
import { SettingsService } from '../../core/services/settings.service';
import { BookstoreService } from '../../core/services/bookstore.service';
import { BookSpreadComponent } from './book-spread.component';
import { QuickActionsModalComponent } from './quick-actions-modal.component';
import { MagnifierComponent } from './magnifier.component';

/**
 * v1 Viewer: headerless, full-bleed book spread with a small, transparent,
 * centered-top floating button that opens a tabbed quick-actions modal.
 *
 * Settings application:
 *  - Theme is applied at the document level by AppComponent (so every
 *    page inherits it; not just the Viewer).
 *  - Reading direction is bound to the host `[dir]` attribute.
 *  - Filters are exposed as a CSS `filter` string the template binds to
 *    the spread host wrapper.
 *  - Page transition is stored but inert until the bottom-sheet lands.
 *
 * Page rendering:
 *  - <ov-book-spread> mounts a `page-flip` instance. The lib draws the
 *    curl effect over our page images; we own layout, gating, and zoom.
 *  - Desktop wheel zoom: when zoom > 1 the curl gesture is auto-disabled
 *    (BookFlipService.setFlippingEnabled(false)), preventing the user
 *    from grabbing a corner that's off-screen.
 *
 * Magnifier:
 *  - Pointerdown on .stage shows the loupe at the opposite screen corner.
 *  - The loupe samples the current page's source image (not the rendered
 *    canvas), so it stays correct through page-flip's transforms.
 *  - Magnification factor is read live from settings (Preferences page).
 */
@Component({
  selector: 'ov-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonIcon, BookSpreadComponent, QuickActionsModalComponent, MagnifierComponent],
  templateUrl: './viewer.page.html',
  styleUrls: ['./viewer.page.scss'],
  host: {
    '[attr.dir]': 'direction()',
  },
})
export class ViewerPage {
  private readonly bookstore = inject(BookstoreService);
  private readonly settings = inject(SettingsService);

  /** Open book, or null. Bound to the spread component. */
  public readonly openBook = computed(() => this.bookstore.state().book);

  /** CSS `filter` string applied to the spread wrapper. */
  public readonly canvasFilter = computed(() => buildFilterString(this.settings.settings().filters));

  /** CSS `image-rendering` for the spread — driven by image-smooth setting.
   *  Only nearest-neighbor and bilinear/auto are CSS-mappable today; the
   *  other enum values are stored but inert until a WebGL filter lands. */
  public readonly imageRendering = computed(() => {
    const sm = this.settings.settings().filters.imageSmooth;
    if (!sm.enabled) return 'auto';
    return sm.method === 'nearest-neighbor' ? 'pixelated' : 'auto';
  });

  /** Reading direction bound to the host `[dir]` attribute. */
  public readonly direction = computed<'ltr' | 'rtl'>(() => this.settings.settings().display.readingDirection);

  /** Local UI state: is the quick-actions modal open? */
  private readonly _quickActionsOpen = signal(false);
  public readonly quickActionsOpen = this._quickActionsOpen.asReadonly();

  /** Progress string for the future bottom-sheet. */
  public readonly progress = computed(() => {
    const s = this.bookstore.state();
    if (s.book === null) return '';
    return `${s.currentIndex + 1} / ${s.book.pages.length}`;
  });

  // ──────────── Magnifier state ────────────

  /** Reference to the stage element (.stage) for rect queries. */
  private readonly stageRef = viewChild<ElementRef<HTMLDivElement>>('stage');

  /** Pointer currently down on the stage? */
  private readonly _magnifierActive = signal(false);
  public readonly magnifierActive = this._magnifierActive.asReadonly();

  /** Pointer X/Y in viewport coords. */
  public readonly pointerX = signal(0);
  public readonly pointerY = signal(0);

  /** Snapshot of the stage's viewport-relative rect. Updated on activation. */
  private readonly _hostRect = signal<DOMRect | null>(null);
  public readonly hostRect = this._hostRect.asReadonly();

  /** Viewport size. */
  private readonly _viewportWidth = signal(0);
  private readonly _viewportHeight = signal(0);
  public readonly viewportWidth = this._viewportWidth.asReadonly();
  public readonly viewportHeight = this._viewportHeight.asReadonly();

  /** URL of the current page image. */
  public readonly currentPageUrl = computed<string | null>(() => {
    const page = this.bookstore.currentPage();
    return page === null ? null : page.url;
  });

  /** Magnification factor (live from Preferences). */
  public readonly magnifierZoom = computed(() => this.settings.settings().display.magnifierZoom);

  /** Natural pixel size of the current page image. */
  public readonly naturalSize = signal<{ width: number; height: number } | null>(null);

  constructor() {
    // v1: open the sample book on first entry. Remove once Bookshelf
    // can hand us a real book via routing.
    effect(() => {
      if (this.bookstore.state().book === null) {
        this.bookstore.openBook(buildKingdomSample());
      }
    });

    // Preload the current page image to learn its natural dimensions.
    // Recomputed whenever the page URL changes. The image is held in
    // memory only — we don't render it, just probe its size.
    effect(() => {
      const url = this.currentPageUrl();
      if (url === null) {
        this.naturalSize.set(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        this.naturalSize.set({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        this.naturalSize.set(null);
      };
      img.src = url;
    });
  }

  public openQuickActions(): void {
    this._quickActionsOpen.set(true);
  }

  public closeQuickActions(): void {
    this._quickActionsOpen.set(false);
  }

  /**
   * Desktop-only wheel zoom. Ctrl+wheel = zoom (trackpad pinch is also
   * delivered as wheel+ctrlKey on macOS). Plain wheel is left to the
   * browser so vertical-scroll mode can use it.
   *
   * `preventDefault()` stops the page from scrolling underneath.
   */
  @HostListener('wheel', ['$event'])
  public onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    // Negative deltaY = zoom in (wheel rolled up). Map to multiplicative factor.
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.bookstore.setZoom(factor);
  }

  // ──────────── Magnifier pointer handlers ────────────

  /** Hold duration before the loupe appears. Matches the Android long-press
   *  convention so a quick tap or scroll gesture never triggers it. */
  private static readonly HOLD_MS = 300;
  /** Movement (in CSS px) within the hold window that still counts as a
   *  hold. Beyond this we treat the gesture as a drag and bail out. */
  private static readonly HOLD_SLOP_PX = 8;

  /** setTimeout handle for the hold-delay activation. Cleared on move/up. */
  private holdTimer: number | null = null;
  /** Pointer position when the hold started — used for the slop check. */
  private holdStartX = 0;
  private holdStartY = 0;

  public onStagePointerDown(event: PointerEvent): void {
    // Only main button (mouse left, single-finger touch, pen).
    if (event.button !== 0) return;
    const stage = this.stageRef()?.nativeElement;
    if (stage === undefined) return;
    const rect = stage.getBoundingClientRect();
    this._hostRect.set(rect);
    this._viewportWidth.set(window.innerWidth);
    this._viewportHeight.set(window.innerHeight);
    this.pointerX.set(event.clientX);
    this.pointerY.set(event.clientY);
    this.holdStartX = event.clientX;
    this.holdStartY = event.clientY;
    this.clearHoldTimer();
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      this._magnifierActive.set(true);
    }, ViewerPage.HOLD_MS);
    // Capture the pointer so we keep getting move/up events even if the
    // user drags off the stage. releasePointerCapture fires automatically
    // on pointerup / pointercancel.
    try {
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    } catch {
      // Some targets (e.g. canvas) reject capture. Best-effort.
    }
  }

  public onStagePointerMove(event: PointerEvent): void {
    // Active loupe — track the pointer.
    if (this._magnifierActive()) {
      this.pointerX.set(event.clientX);
      this.pointerY.set(event.clientY);
      return;
    }
    // Still in the hold window — cancel if the user has moved too far.
    if (this.holdTimer !== null) {
      const dx = event.clientX - this.holdStartX;
      const dy = event.clientY - this.holdStartY;
      if (dx * dx + dy * dy > ViewerPage.HOLD_SLOP_PX * ViewerPage.HOLD_SLOP_PX) {
        this.clearHoldTimer();
      }
    }
  }

  public onStagePointerUp(): void {
    this.clearHoldTimer();
    this._magnifierActive.set(false);
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }
  /**
   * Cancel the magnifier on window blur (alt-tab) or visibility change
   * so it doesn't get stuck visible after the user leaves.
   */
  @HostListener('window:blur')
  public onWindowBlur(): void {
    this._magnifierActive.set(false);
  }

  @HostListener('document:visibilitychange')
  public onVisibilityChange(): void {
    if (document.hidden) this._magnifierActive.set(false);
  }
}

function buildFilterString(filters: FilterSettings): string {
  const parts: string[] = [];
  if (filters.brightness.enabled) parts.push(`brightness(${filters.brightness.value}%)`);
  if (filters.contrast.enabled) parts.push(`contrast(${filters.contrast.value}%)`);
  if (filters.gamma.enabled) {
    const g = filters.gamma.value;
    const brightness = g <= 1 ? 60 + 40 * (g - 0.5) / 0.5 : 100 + 100 * (g - 1) / 1.5;
    parts.push(`brightness(${brightness.toFixed(0)}%)`);
  }
  if (filters.blueLight.enabled && filters.blueLight.value > 0) {
    const s = filters.blueLight.value / 80;
    parts.push(`sepia(${s.toFixed(2)}) hue-rotate(-10deg)`);
  }
  if (filters.grayscale.enabled && filters.grayscale.value > 0) {
    parts.push(`grayscale(${filters.grayscale.value}%)`);
  }
  if (filters.sepia.enabled && filters.sepia.value > 0) {
    parts.push(`sepia(${filters.sepia.value}%)`);
  }
  // Sharpen: CSS has no native sharpen filter. Approximate by boosting
  // contrast, since high-contrast edges read as "sharper". Coarse but
  // honest about the limitation — true unsharp-mask needs WebGL.
  if (filters.sharpen.enabled && filters.sharpen.value > 0) {
    const boost = 100 + filters.sharpen.value * 10;
    parts.push(`contrast(${boost.toFixed(0)}%)`);
  }
  if (filters.blur.enabled && filters.blur.value > 0) {
    parts.push(`blur(${filters.blur.value}px)`);
  }
  // Grain: no CSS noise filter. Approximate via brightness jitter so the
  // user sees the slider do *something*. Replace with a WebGL pass when
  // the image-renderer plugin lands.
  if (filters.grain.enabled && filters.grain.value > 0) {
    const jitter = 100 - filters.grain.value / 2;
    parts.push(`brightness(${jitter.toFixed(0)}%)`);
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}
