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
import { BookFlipService } from '../../core/services/book-flip.service';
import { BookstoreService } from '../../core/services/bookstore.service';
import { MagnifierStateService } from '../../core/services/magnifier-state.service';
import { SettingsService } from '../../core/services/settings.service';
import { BookSpreadComponent } from './book-spread.component';
import { MagnifierComponent } from './magnifier.component';
import { QuickActionsModalComponent } from './quick-actions-modal.component';

/**
 * v1 Viewer: headerless, full-bleed book spread with a small, transparent,
 * centered-top floating button that opens a tabbed quick-actions modal.
 *
 * Page rendering:
 *  - <ov-book-spread> mounts page-flip with `useMouseEvents: false`.
 *  - The viewer `.stage` relays pointer events for page turns via
 *    BookFlipService.relayPointerDown/Move/Up and relayTap.
 *  - When zoom > 1, relay is skipped (`bookstore.cornersVisible()`).
 *
 * Magnifier:
 *  - Hold on `.stage` for 300ms shows the loupe at the opposite corner.
 *  - Drag beyond slop during the hold window relays to page-flip instead.
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

  /**
   * Viewport rect where the current page image is drawn. In dual spread
   * each page occupies half the stage; mapping pointer → image must use
   * this rect, not the full stage.
   */
  public readonly pageImageRect = computed<DOMRect | null>(() => {
    const stage = this.hostRect();
    if (stage === null) return null;

    const layout = this.settings.settings().display.pageLayout;
    if (layout !== 'auto-dual') {
      return stage;
    }

    const state = this.bookstore.state();
    if (state.book === null) {
      return stage;
    }

    const index = state.currentIndex;
    const rtl = this.settings.settings().display.readingDirection === 'rtl';
    const halfW = stage.width / 2;
    const onLeft = rtl ? index % 2 === 1 : index % 2 === 0;

    return onLeft
      ? new DOMRect(stage.left, stage.top, halfW, stage.height)
      : new DOMRect(stage.left + halfW, stage.top, halfW, stage.height);
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
  private static readonly HOLD_SLOP_PX = 8;

  private holdTimer: number | null = null;
  private holdStartX = 0;
  private holdStartY = 0;

  public onStagePointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const stage = this.stageRef()?.nativeElement;
    if (stage === undefined) return;

    this.magnifierState.setHolding(true);

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
    if (this.magnifierState.relayFlip()) {
      if (this.bookstore.cornersVisible()) {
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
      const dx = event.clientX - this.holdStartX;
      const dy = event.clientY - this.holdStartY;
      if (dx * dx + dy * dy > ViewerPage.HOLD_SLOP_PX * ViewerPage.HOLD_SLOP_PX) {
        this.beginFlipRelay();
        if (this.bookstore.cornersVisible()) {
          this.flip.relayPointerMove(event.clientX, event.clientY);
        }
      }
    }
  }

  public onStagePointerUp(event: PointerEvent): void {
    if (this.magnifierState.relayFlip()) {
      if (this.bookstore.cornersVisible()) {
        this.flip.relayPointerUp(event.clientX, event.clientY);
      }
    } else if (!this.magnifierState.active() && this.bookstore.cornersVisible()) {
      this.flip.relayTap(event.clientX, event.clientY);
    }

    this.clearHoldTimer();
    this.magnifierState.endGesture();
  }

  private beginFlipRelay(): void {
    this.clearHoldTimer();
    this.magnifierState.setRelayFlip(true);
    if (this.bookstore.cornersVisible()) {
      this.flip.relayPointerDown(this.holdStartX, this.holdStartY);
    }
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
    this.magnifierState.endGesture();
  }

  @HostListener('document:visibilitychange')
  public onVisibilityChange(): void {
    if (document.hidden) {
      this.clearHoldTimer();
      this.magnifierState.endGesture();
    }
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
