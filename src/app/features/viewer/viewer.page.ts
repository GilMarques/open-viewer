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
      this.stopMomentum();
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
  /** Per-frame velocity decay while coasting after a pan release (~60fps frame). */
  private static readonly MOMENTUM_DECAY = 0.93;
  /** Coast stops below this px/ms velocity. */
  private static readonly MOMENTUM_STOP_VELOCITY = 0.03;
  /** Fling velocity cap at release (px/ms). */
  private static readonly MOMENTUM_MAX_VELOCITY = 3;

  private holdTimer: number | null = null;
  private holdStartX = 0;
  private holdStartY = 0;
  private panBaseX = 0;
  private panBaseY = 0;
  private gestureAxis: GestureAxis | null = null;
  /** Recent pointer samples during a pan — used to derive release velocity. */
  private panSamples: Array<{ x: number; y: number; t: number }> = [];
  private momentumAxis: GestureAxis | null = null;
  private momentumVelocity = 0;
  private momentumRaf: number | null = null;

  public onStagePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const stage = this.stageRef()?.nativeElement;
    if (stage === undefined) return;
    // Ignore input while a turn animation is running.
    if (this.flip.flipState() === 'flipping') return;

    this.stopMomentum();
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
      this.recordPanSample(event.clientX, event.clientY);
      if (this.gestureAxis === 'horizontal' && this.shouldBeginFlipRelay(dx)) {
        // Reached the page edge: stop panning and start the curl fold.
        this.magnifierState.setRelayPan(false);
        this.beginFlipRelay();
        if (this.bookstore.cornersVisible()) {
          this.flip.relayPointerMove(event.clientX, event.clientY);
        }
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
    const wasPan = this.magnifierState.relayPan();
    const axis = this.gestureAxis;

    if (this.magnifierState.relayFlip()) {
      // Release: the patched lib completes the fold from its current
      // position (stopMove commits whenever state is USER_FOLD).
      if (this.bookstore.cornersVisible()) {
        this.flip.relayPointerUp(event.clientX, event.clientY);
      }
    } else if (
      !this.magnifierState.active() &&
      !wasPan &&
      this.isQuickTap(event) &&
      this.bookstore.cornersVisible()
    ) {
      this.flip.relayTap(event.clientX, event.clientY);
    }

    this.clearHoldTimer();
    this.gestureAxis = null;
    this.magnifierState.endGesture();

    // Fling: keep gliding with the release velocity, decaying each frame.
    if (wasPan && axis !== null) {
      this.startMomentum(axis);
    }
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

  /** Keep a rolling window of pan positions so release velocity is smooth. */
  private recordPanSample(x: number, y: number): void {
    this.panSamples.push({ x, y, t: performance.now() });
    if (this.panSamples.length > 8) this.panSamples.shift();
  }

  /**
   * Release velocity along `axis`, px/ms. Uses the last sample against the
   * most recent one at least 40ms earlier for stability; tiny velocities
   * (<= 0.15 px/ms) count as a stop so micro-drift never glides.
   */
  private computePanVelocity(axis: GestureAxis): number {
    const samples = this.panSamples;
    if (samples.length < 2) return 0;
    const last = samples[samples.length - 1];
    let ref = samples[0];
    for (let i = samples.length - 2; i >= 0; i--) {
      ref = samples[i];
      if (last.t - samples[i].t >= 40) break;
    }
    const dt = last.t - ref.t;
    if (dt <= 0) return 0;

    const dv = axis === 'horizontal' ? last.x - ref.x : last.y - ref.y;
    let v = dv / dt;
    if (Math.abs(v) < 0.15) return 0;
    const max = ViewerPage.MOMENTUM_MAX_VELOCITY;
    return Math.max(-max, Math.min(max, v));
  }

  /** Glide the page after a pan release, decaying velocity to a stop. */
  private startMomentum(axis: GestureAxis): void {
    this.stopMomentum();
    const velocity = this.computePanVelocity(axis);
    if (velocity === 0) return;

    this.momentumAxis = axis;
    this.momentumVelocity = velocity;
    let last = performance.now();

    const step = (now: number): void => {
      const dt = Math.min(32, now - last);
      last = now;
      this.momentumVelocity *= Math.pow(ViewerPage.MOMENTUM_DECAY, dt / 16.667);

      const { minX, maxX, minY, maxY } = this.panExtents();
      if (this.momentumAxis === 'horizontal') {
        const next = clamp(this.panOffsetX() + this.momentumVelocity * dt, minX, maxX);
        if (next <= minX || next >= maxX) this.momentumVelocity = 0;
        this.panOffsetX.set(next);
      } else {
        const next = clamp(this.panOffsetY() + this.momentumVelocity * dt, minY, maxY);
        if (next <= minY || next >= maxY) this.momentumVelocity = 0;
        this.panOffsetY.set(next);
      }

      if (Math.abs(this.momentumVelocity) < ViewerPage.MOMENTUM_STOP_VELOCITY) {
        this.momentumRaf = null;
        this.momentumAxis = null;
        return;
      }
      this.momentumRaf = requestAnimationFrame(step);
    };

    this.momentumRaf = requestAnimationFrame(step);
  }

  /** Cancel a running coast and clear velocity history. */
  private stopMomentum(): void {
    if (this.momentumRaf !== null) {
      cancelAnimationFrame(this.momentumRaf);
      this.momentumRaf = null;
    }
    this.momentumAxis = null;
    this.momentumVelocity = 0;
    this.panSamples = [];
  }

  /**
   * Start the interactive curl: hand the pointer off to page-flip's fold
   * (USER_FOLD) so the page follows the finger. The turn commits on release.
   */
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
    this.stopMomentum();
    this.gestureAxis = null;
    this.magnifierState.endGesture();
  }

  @HostListener('document:visibilitychange')
  public onVisibilityChange(): void {
    if (document.hidden) {
      this.clearHoldTimer();
      this.stopMomentum();
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
