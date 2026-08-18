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
import { BookstoreService } from '../../core/services/bookstore.service';
import { PageCanvasComponent } from './page-canvas.component';
import { QuickActionsModalComponent } from './quick-actions-modal.component';

/**
 * v1 Viewer: headerless, full-bleed canvas with a small, transparent,
 * centered-top floating button that opens a tabbed quick-actions modal.
 *
 * The sample loader is dev-only. Real book opening comes from the
 * File Browser / Bookshelf issues — this page just consumes whatever the
 * BookstoreService currently has open.
 */
@Component({
  selector: 'ov-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonContent, IonIcon, PageCanvasComponent, QuickActionsModalComponent],
  templateUrl: './viewer.page.html',
  styleUrls: ['./viewer.page.scss'],
})
export class ViewerPage {
  private readonly bookstore = inject(BookstoreService);

  /** Reactive snapshot the template binds to. */
  public readonly page = this.bookstore.currentPage;

  /** Local UI state: is the quick-actions modal open? */
  private readonly _quickActionsOpen = signal(false);
  public readonly quickActionsOpen = this._quickActionsOpen.asReadonly();

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