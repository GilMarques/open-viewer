import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular/standalone';

import { buildKingdomSample } from '../../core/debug/sample-books';
import type { FilterSettings } from '../../core/models/settings.model';
import { SettingsService } from '../../core/services/settings.service';
import { BookstoreService } from '../../core/services/bookstore.service';
import { BookSpreadComponent } from './book-spread.component';
import { QuickActionsModalComponent } from './quick-actions-modal.component';
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
 */
@Component({
  selector: 'ov-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonIcon, BookSpreadComponent, QuickActionsModalComponent],
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

  constructor() {
    // v1: open the sample book on first entry. Remove once Bookshelf
    // can hand us a real book via routing.
    effect(() => {
      if (this.bookstore.state().book === null) {
        this.bookstore.openBook(buildKingdomSample());
      }
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