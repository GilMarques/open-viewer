import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { IonContent, IonIcon } from '@ionic/angular/standalone';

import { buildKingdomSample } from '../../core/debug/sample-books';
import { SettingsService } from '../../core/services/settings.service';
import { BookstoreService } from '../../core/services/bookstore.service';
import { PageCanvasComponent } from './page-canvas.component';
import { QuickActionsModalComponent } from './quick-actions-modal.component';

/**
 * v1 Viewer: headerless, full-bleed canvas with a small, transparent,
 * centered-top floating button that opens a tabbed quick-actions modal.
 *
 * Settings application:
 *  - Theme is applied at the document level by AppComponent (so every
 *    page inherits it; not just the Viewer).
 *  - Reading direction is bound to the host `[dir]` attribute (flips
 *    horizontal layouts).
 *  - Filters are exposed as a CSS `filter` string the template binds to
 *    the canvas stage.
 *  - Page transition is stored but inert — the bottom-sheet progress
 *    component will read it.
 */
@Component({
  selector: 'ov-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonIcon, PageCanvasComponent, QuickActionsModalComponent],
  templateUrl: './viewer.page.html',
  styleUrls: ['./viewer.page.scss'],
  host: {
    '[attr.dir]': 'direction()',
  },
})
export class ViewerPage {
  private readonly bookstore = inject(BookstoreService);
  private readonly settings = inject(SettingsService);

  /** Reactive snapshot the template binds to. */
  public readonly page = this.bookstore.currentPage;

  /** Local UI state: is the quick-actions modal open? */
  private readonly _quickActionsOpen = signal(false);
  public readonly quickActionsOpen = this._quickActionsOpen.asReadonly();

  /** CSS `filter` string applied to the canvas stage. */
  public readonly canvasFilter = computed(() => buildFilterString(this.settings.settings().filters));

  /** Reading direction bound to the host `[dir]` attribute. */
  public readonly direction = computed<'ltr' | 'rtl'>(() => this.settings.settings().display.readingDirection);

  /** Progress string like "12 / 63" — exposed for the future progress
   *  bottom sheet; not rendered in the template today. */
  public readonly progress = computed(() => {
    const p = this.page();
    if (p === null) return '';
    const total = this.bookstore.state().book?.pages.length ?? 0;
    return `${p.index + 1} / ${total}`;
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
}

/**
 * Build a CSS `filter` string from a FilterSettings object.
 *
 * Brightness and contrast are percentages; gamma has no CSS equivalent, so
 * we approximate it by remapping 0.5..2.5 to ~60..200% brightness. Imperfect
 * (gamma is non-linear) but free, and avoids a custom shader until v2.
 *
 * Blue light is implemented as a sepia blend + hue-rotate — close enough
 * to f.lux / Night Shift for a v1 reader.
 */
function buildFilterString(filters: {
  brightness: { enabled: boolean; value: number };
  blueLight: { enabled: boolean; value: number };
  contrast: { enabled: boolean; value: number };
  gamma: { enabled: boolean; value: number };
}): string {
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
  return parts.length > 0 ? parts.join(' ') : 'none';
}