import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
} from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonMenuButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

import { buildKingdomSample } from '../../core/debug/sample-books';
import { BookstoreService } from '../../core/services/bookstore.service';
import { PageCanvasComponent } from './page-canvas.component';

/**
 * v1 Viewer: loads the local Kingdom sample book on first paint, renders
 * the current page in <ov-page-canvas>, exposes prev/next buttons in the
 * toolbar.
 *
 * The sample loader is dev-only. Real book opening comes from the
 * File Browser / Bookshelf issues — this page just consumes whatever the
 * BookstoreService currently has open.
 */
@Component({
  selector: 'ov-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonMenuButton,
    IonTitle,
    IonToolbar,
    PageCanvasComponent,
  ],
  templateUrl: './viewer.page.html',
  styleUrls: ['./viewer.page.scss'],
})
export class ViewerPage {
  private readonly bookstore = inject(BookstoreService);

  /** Reactive snapshot the template binds to. */
  public readonly page = this.bookstore.currentPage;
  public readonly hasPrev = this.bookstore.hasPrev;
  public readonly hasNext = this.bookstore.hasNext;
  /** Progress string like "12 / 63" for the toolbar title. */
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

  public next(): void {
    this.bookstore.next();
  }

  public prev(): void {
    this.bookstore.prev();
  }
}