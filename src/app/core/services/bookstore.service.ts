import { Injectable, computed, signal } from '@angular/core';

import type { Book, OpenBookState, Page } from '../models/book.model';

/**
 * Holds the currently-open book + current page index in memory as signals.
 *
 * This is the runtime store; persistence (favorites, last-opened page per
 * book, bookmarks) is the Bookshelf's concern and lives elsewhere. Don't
 * conflate them — this service is *only* what the Viewer needs right now.
 *
 * v1 navigation is sequential (prev / next / goTo). Swipe gestures will
 * call into these helpers once we add them to ov-page-canvas.
 */
@Injectable({ providedIn: 'root' })
export class BookstoreService {
  private readonly _state = signal<OpenBookState>({ book: null });

  /** Reactive snapshot of the open-book state. */
  public readonly state = this._state.asReadonly();

  /** Current page, or `null` if no book is open or index is out of range. */
  public readonly currentPage = computed<Page | null>(() => {
    const s = this._state();
    if (s.book === null) return null;
    return s.book.pages[s.currentIndex] ?? null;
  });

  /** True when there is a next page. */
  public readonly hasNext = computed(() => {
    const s = this._state();
    return s.book !== null && s.currentIndex < s.book.pages.length - 1;
  });

  /** True when there is a previous page. */
  public readonly hasPrev = computed(() => {
    const s = this._state();
    return s.book !== null && s.currentIndex > 0;
  });

  /** Open a book. Resets the current index to 0 and the zoom to 1. */
  public openBook(book: Book): void {
    this._zoom.set(1);
    this._state.set({ book, currentIndex: 0 });
  }

  /** Close the current book. */
  public closeBook(): void {
    this._state.set({ book: null });
  }

  /** Advance to the next page. No-op if there isn't one. */
  public next(): void {
    const s = this._state();
    if (s.book === null) return;
    if (s.currentIndex >= s.book.pages.length - 1) return;
    this._state.set({ book: s.book, currentIndex: s.currentIndex + 1 });
  }

  /** Go to the previous page. No-op if there isn't one. */
  public prev(): void {
    const s = this._state();
    if (s.book === null) return;
    if (s.currentIndex <= 0) return;
    this._state.set({ book: s.book, currentIndex: s.currentIndex - 1 });
  }

  /** Jump to an absolute page index. Out-of-range indices clamp. */
  public goTo(index: number): void {
    const s = this._state();
    if (s.book === null) return;
    const clamped = Math.max(0, Math.min(index, s.book.pages.length - 1));
    this._state.set({ book: s.book, currentIndex: clamped });
  }

  /** Zoom factor applied to the rendered page quad. 1 = fit-screen.
   *  Reset on book open. v1 only: desktop scroll-wheel zoom. Pinch comes later. */
  private readonly _zoom = signal(1);
  public readonly zoom = this._zoom.asReadonly();

  /** True only when zoomed all the way out — that's the only state in v1
   *  where a page corner is guaranteed visible. The flip lib's curl is
   *  gated on this. */
  public readonly cornersVisible = computed(() => this._zoom() === 1);

  /** Apply a multiplicative zoom factor (e.g. wheel delta → 1.1 / 0.9).
   *  Clamped to [1, 4]. No-op on books that aren't open. */
  public setZoom(factor: number): void {
    if (this._state().book === null) return;
    if (!Number.isFinite(factor) || factor <= 0) return;
    const next = Math.min(4, Math.max(1, this._zoom() * factor));
    this._zoom.set(next);
  }

  /** Reset zoom to 1 (used on book open + on closing the modal). */
  public resetZoom(): void {
    this._zoom.set(1);
  }
}