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
import { BookFlipService, computePageDimensions } from '../../core/services/book-flip.service';
import { BookstoreService } from '../../core/services/bookstore.service';
import { MagnifierStateService } from '../../core/services/magnifier-state.service';
import { SettingsService } from '../../core/services/settings.service';
import { BookSpreadComponent } from './book-spread.component';
import { MagnifierComponent } from './magnifier.component';
import { QuickActionsModalComponent } from './quick-actions-modal.component';

type GestureAxis = 'horizontal' | 'vertical';

interface PanExtents {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly overflowX: number;
  readonly overflowY: number;
}

/**
 * v1 Viewer: headerless, full-bleed book spread with a small, transparent,
 * centered-top floating button that opens a tabbed quick-actions modal.
 *
 * Pointer routing on `.stage`:
 *  - Vertical drag pans when the page is taller than the viewport.
 *  - Horizontal drag pans until the page edge, then relays to page-flip.
 *  - Quick tap still relays a corner flip when wheel zoom is at 1×.
 *  - Hold 300ms opens the magnifier loupe.
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
  private readonly magnifierState = inject(MagnifierStateService);
  private readonly flip = inject(BookFlipService);

  /** Open book, or null. Bound to the spread component. */
  public readonly openBook = computed(() => this.bookstore.state().book);

  /** CSS `filter` string applied to the spread wrapper. */
  public readonly canvasFilter = computed(() => buildFilterString(this.settings.settings().filters));

  /** CSS `image-rendering` for the spread — driven by image-smooth setting. */
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

  /** Live loupe-visible flag for the template. */
  public readonly magnifierActive = this.magnifierState.active;

  /** Pointer X/Y in viewport coords. */
  public readonly pointerX = signal(0);
  public readonly pointerY = signal(0);

  /** Snapshot of the stage's viewport-relative rect. Updated on activation. */
  private readonly _hostRect = signal<DOMRect | null>(null);
  public readonly hostRect = this._hostRect.asReadonly();

  /** Pan offset applied to `<ov-book-spread>` when the page exceeds the stage. */
  private readonly panOffsetX = signal(0);
  private readonly panOffsetY = signal(0);

  public readonly panTransform = computed(
    () => `translate(${this.panOffsetX()}px, ${this.panOffsetY()}px)`,
  );

  private readonly spreadLayout = computed<'single' | 'double'>(() => {
    const layout = this.settings.settings().display.pageLayout;
    return layout === 'auto-dual' ? 'double' : 'single';
  });

  private readonly renderedPageSize = computed(() => {
    const natural = this.naturalSize();
    const stage = this.hostRect();
    if (natural === null || stage === null) return null;
    const zoom = this.settings.settings().display.zoom;
    return computePageDimensions(stage.width, stage.height, natural, zoom, this.spreadLayout());
  });

  private readonly panExtents = computed<PanExtents>(() => {
    const stage = this.hostRect();
    if (stage === null) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, overflowX: 0, overflowY: 0 };
    }

    const rendered = this.renderedPageSize();
    const pageRect = this.flip.mounted() ? this.flip.getPageElementRect() : null;

    let overflowX = 0;
    let overflowY = 0;
    if (rendered !== null) {
      overflowX = Math.max(0, rendered.width - stage.width);
      overflowY = Math.max(0, rendered.height - stage.height);
    }
    if (pageRect !== null) {
      overflowX = Math.max(overflowX, pageRect.width - stage.width);
      overflowY = Math.max(overflowY, pageRect.height - stage.height);
    }

    return {
      minX: -overflowX,
      maxX: 0,
      minY: -overflowY,
      maxY: 0,
      overflowX,
      overflowY,
    };
  });

  /**
   * Viewport rect where the current page image is drawn. In dual spread
   * each page occupies half the stage; mapping pointer → image must use
   * this rect, not the full stage.
   */
  public readonly pageImageRect = computed<DOMRect | null>(() => {
    const stage = this.hostRect();
    if (stage === null) return null;

    const panX = this.panOffsetX();
    const panY = this.panOffsetY();

    const layout = this.settings.settings().display.pageLayout;
    if (layout !== 'auto-dual') {
      return new DOMRect(stage.left + panX, stage.top + panY, stage.width, stage.height);
    }

    const state = this.bookstore.state();
    if (state.book === null) {
      return new DOMRect(stage.left + panX, stage.top + panY, stage.width, stage.height);
    }

    const index = state.currentIndex;
    const rtl = this.settings.settings().display.readingDirection === 'rtl';
    const halfW = stage.width / 2;
    const onLeft = rtl ? index % 2 === 1 : index % 2 === 0;

    return onLeft
      ? new DOMRect(stage.left + panX, stage.top + panY, halfW, stage.height)
      : new DOMRect(stage.left + halfW + panX, stage.top + panY, halfW, stage.height);
  });

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
    effect(() => {
      if (this.bookstore.state().book === null) {
        this.bookstore.openBook(buildKingdomSample());
      }
    });

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

    effect(() => {
      this.flip.currentIndex();
      this.settings.settings().display.zoom;
      this.settings.settings().display.pageLayout;
      this.resetPan();
    });
  }

  public openQuickActions(): void {
    this._quickActionsOpen.set(true);
  }

  public closeQuickActions(): void {
    this._quickActionsOpen.set(false);
  }

  @HostListener('wheel', ['$event'])
  public onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    this.bookstore.setZoom(factor);
  }

  // ──────────── Magnifier + page-flip pointer relay ────────────

  private static readonly HOLD_MS = 300;
  /** Horizontal slop before a drag leaves the hold window (vertical uses axis lock only). */
  private static readonly HORIZONTAL_SLOP_PX = 8;

  private holdTimer: number | null = null;
  private holdStartX = 0;
  private holdStartY = 0;
  private panBaseX = 0;
  private panBaseY = 0;
  private gestureAxis: GestureAxis | null = null;

  public onStagePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const stage = this.stageRef()?.nativeElement;
    if (stage === undefined) return;

    this.magnifierState.setHolding(true);
    this.gestureAxis = null;

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
      this.magnifierState.setActive(true);
    }, ViewerPage.HOLD_MS);

    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      // Best-effort — some browsers reject capture.
    }
  }

  public onStagePointerMove(event: PointerEvent): void {
    const dx = event.clientX - this.holdStartX;
    const dy = event.clientY - this.holdStartY;

    if (this.magnifierState.relayFlip()) {
      if (this.bookstore.cornersVisible()) {
        this.flip.relayPointerMove(event.clientX, event.clientY);
      }
      return;
    }

    if (this.magnifierState.relayPan()) {
      this.applyPanFromDrag(dx, dy);
      if (
        this.gestureAxis === 'horizontal' &&
        this.shouldBeginFlipRelay(dx) &&
        this.bookstore.cornersVisible()
      ) {
        this.magnifierState.setRelayPan(false);
        this.beginFlipRelay();
        this.flip.relayPointerMove(event.clientX, event.clientY);
      }
      return;
    }

    if (this.magnifierState.active()) {
      this.pointerX.set(event.clientX);
      this.pointerY.set(event.clientY);
      return;
    }

    if (this.holdTimer !== null) {
      this.tryBeginDragRelay(dx, dy, event);
    }
  }

  public onStagePointerUp(event: PointerEvent): void {
    if (this.magnifierState.relayFlip()) {
      if (this.bookstore.cornersVisible()) {
        this.flip.relayPointerUp(event.clientX, event.clientY);
      }
    } else if (
      !this.magnifierState.active() &&
      !this.magnifierState.relayPan() &&
      this.isQuickTap(event) &&
      this.bookstore.cornersVisible()
    ) {
      this.flip.relayTap(event.clientX, event.clientY);
    }

    this.clearHoldTimer();
    this.gestureAxis = null;
    this.magnifierState.endGesture();
  }

  /** True when pointer release is still within the hold slop (no pan / drag). */
  private isQuickTap(event: PointerEvent): boolean {
    const dx = event.clientX - this.holdStartX;
    const dy = event.clientY - this.holdStartY;
    return (
      dx * dx + dy * dy <=
      ViewerPage.HORIZONTAL_SLOP_PX * ViewerPage.HORIZONTAL_SLOP_PX
    );
  }

  /**
   * Decide pan vs page-flip once the user moves past slop.
   * Vertical movement pans tall pages; horizontal movement pans until an edge,
   * then hands off to page-flip for the next/prev curl.
   */
  private tryBeginDragRelay(dx: number, dy: number, event: PointerEvent): void {
    const { overflowX, overflowY } = this.panExtents();

    if (
      Math.abs(dx) < ViewerPage.HORIZONTAL_SLOP_PX &&
      Math.abs(dy) < ViewerPage.HORIZONTAL_SLOP_PX
    ) {
      return;
    }

    if (Math.abs(dy) > Math.abs(dx)) {
      if (overflowY > 0) {
        this.beginPanRelay('vertical');
        this.applyPanFromDrag(dx, dy);
      }
      return;
    }

    if (Math.abs(dx) < ViewerPage.HORIZONTAL_SLOP_PX) {
      return;
    }

    if (this.shouldBeginFlipRelay(dx)) {
      this.beginFlipRelay();
      if (this.bookstore.cornersVisible()) {
        this.flip.relayPointerMove(event.clientX, event.clientY);
      }
      return;
    }

    if (overflowX > 0) {
      this.beginPanRelay('horizontal');
      this.applyPanFromDrag(dx, dy);
    }
  }

  private shouldBeginFlipRelay(dx: number): boolean {
    if (!this.bookstore.cornersVisible()) return false;

    const { overflowX } = this.panExtents();
    if (overflowX <= 0) {
      return Math.abs(dx) >= ViewerPage.HORIZONTAL_SLOP_PX;
    }

    const rtl = this.direction() === 'rtl';
    if (rtl) {
      if (this.atLeftEdge() && dx < -ViewerPage.HORIZONTAL_SLOP_PX) return true;
      if (this.atRightEdge() && dx > ViewerPage.HORIZONTAL_SLOP_PX) return true;
    } else {
      if (this.atRightEdge() && dx < -ViewerPage.HORIZONTAL_SLOP_PX) return true;
      if (this.atLeftEdge() && dx > ViewerPage.HORIZONTAL_SLOP_PX) return true;
    }

    return false;
  }

  private atLeftEdge(): boolean {
    const { overflowX } = this.panExtents();
    if (overflowX <= 0) return true;
    return this.panOffsetX() >= -1;
  }

  private atRightEdge(): boolean {
    const { minX, overflowX } = this.panExtents();
    if (overflowX <= 0) return true;
    return this.panOffsetX() <= minX + 1;
  }

  private applyPanFromDrag(dx: number, dy: number): void {
    const { minX, maxX, minY, maxY } = this.panExtents();

    if (this.gestureAxis === 'vertical') {
      this.panOffsetY.set(clamp(this.panBaseY + dy, minY, maxY));
      return;
    }

    if (this.gestureAxis === 'horizontal') {
      this.panOffsetX.set(clamp(this.panBaseX + dx, minX, maxX));
    }
  }

  private beginPanRelay(axis: GestureAxis): void {
    this.clearHoldTimer();
    this.gestureAxis = axis;
    this.panBaseX = this.panOffsetX();
    this.panBaseY = this.panOffsetY();
    this.magnifierState.setRelayPan(true);
  }

  private beginFlipRelay(): void {
    this.clearHoldTimer();
    this.gestureAxis = null;
    this.magnifierState.setRelayFlip(true);
    if (this.bookstore.cornersVisible()) {
      this.flip.relayPointerDown(this.holdStartX, this.holdStartY);
    }
  }

  private resetPan(): void {
    this.panOffsetX.set(0);
    this.panOffsetY.set(0);
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  @HostListener('window:blur')
  public onWindowBlur(): void {
    this.clearHoldTimer();
    this.gestureAxis = null;
    this.magnifierState.endGesture();
  }

  @HostListener('document:visibilitychange')
  public onVisibilityChange(): void {
    if (document.hidden) {
      this.clearHoldTimer();
      this.gestureAxis = null;
      this.magnifierState.endGesture();
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  if (filters.sharpen.enabled && filters.sharpen.value > 0) {
    const boost = 100 + filters.sharpen.value * 10;
    parts.push(`contrast(${boost.toFixed(0)}%)`);
  }
  if (filters.blur.enabled && filters.blur.value > 0) {
    parts.push(`blur(${filters.blur.value}px)`);
  }
  if (filters.grain.enabled && filters.grain.value > 0) {
    const jitter = 100 - filters.grain.value / 2;
    parts.push(`brightness(${jitter.toFixed(0)}%)`);
  }
  return parts.length > 0 ? parts.join(' ') : 'none';
}
