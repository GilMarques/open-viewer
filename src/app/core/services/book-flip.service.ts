import { Injectable, signal } from '@angular/core';

import { PageFlip, FlippingState, type FlipSetting } from 'page-flip';

import type { Book } from '../models/book.model';
import type { ZoomMode } from '../models/settings.model';
/**
 * Wraps a `page-flip` (StPageFlip) instance — owns its lifecycle, exposes
 * a tiny signal-based surface for the rest of the app, and turns the lib's
 * DOM-event API into something reactive.
 *
 * v1 only supports image-mode books (one image per page). HTML-mode
 * (EPUB) lands later; the lib supports it via `loadFromHTML`.
 *
 * Why we wrap instead of using PageFlip directly:
 *  - One PageFlip instance per book. Created in BookSpreadComponent on
 *    `ngAfterViewInit`, destroyed on `ngOnDestroy` or book change.
 *  - The lib doesn't have a "current index" signal — we read it from
 *    `getCurrentPageIndex()` on its `flip` event.
 *  - `enableFlipping`/`disableFlipping` toggle the curl gesture. We
 *    gate this on `bookstore.cornersVisible()`.
 */
@Injectable({ providedIn: 'root' })
export class BookFlipService {
  private instance: PageFlip | null = null;
  private host: HTMLElement | null = null;

  /** Reactive current page index (0-based), mirrored from the lib. */
  private readonly _currentIndex = signal(0);
  public readonly currentIndex = this._currentIndex.asReadonly();

  /** True while a PageFlip instance is mounted and ready. */
  private readonly _mounted = signal(false);
  public readonly mounted = this._mounted.asReadonly();

  /**
   * Mount a PageFlip instance on `host` and load all pages from `book`.
   *
   * `host` must already have its CSS size set (width/height in px). The
   * lib measures the host; if it's 0×0 the curl won't be hittable.
   *
   * If a previous instance is still around, destroy it first. Re-entrant
   * safe: this can be called whenever the book changes.
   */
  public mount(host: HTMLElement, book: Book, layout: 'single' | 'double', zoom: ZoomMode = 'stretch-to-fill'): void {
    this.unmount();

    const settings: Partial<FlipSetting> = {
      width: host.clientWidth,
      height: host.clientHeight,
      // 'single' = one page per spread; 'double' = two-page spread (book-like).
      showPageCorners: true,
      disableFlipByClick: false,
      // Single-page mode: each page is its own leaf; double-page: pairs.
      ...(layout === 'single'
        ? { singlePage: true, usePortrait: true }
        : { singlePage: false, usePortrait: false }),
      startZIndex: 0,
      autoSize: false,
      // Don't let the lib draw its own shadows/CSS that fights our theme.
      drawShadow: true,
      flippingTime: 600,
      // Mobile: pinch-to-zoom will be ours; tell the lib not to handle it.
      maxShadowOpacity: 0.5,
    };

    const pf = new PageFlip(host, settings);
    pf.loadFromImages(book.pages.map((p) => p.url));

    pf.on('flip', (e) => {
      // The lib reports the new index; mirror it for our consumers.
      if (typeof e.data === 'number') {
        this._currentIndex.set(e.data);
      }
    });

    this.instance = pf;
    this.host = host;
    this._currentIndex.set(pf.getCurrentPageIndex());
    this._mounted.set(true);
  }

  /** Tear down the current instance if any. Idempotent. */
  public unmount(): void {
    if (this.instance === null) return;
    try {
      this.instance.destroy();
    } catch {
      // destroy() can throw if the host was already detached. Swallow.
    }
    this.instance = null;
    this.host = null;
    this._mounted.set(false);
  }

  /** Toggle the lib's gesture (curl) on or off. */
  public setFlippingEnabled(enabled: boolean): void {
    if (this.instance === null) return;
    if (enabled) this.instance.updateState(FlippingState.READ);
    else this.instance.updateState(FlippingState.USER_FOLD);
  }

  /** Tell the lib its container size changed (e.g. orientation flip). */
  public update(): void {
    this.instance?.update();
  }

  /** Imperative nav — used by the bottom-sheet progress component. */
  public turnToPage(index: number): void {
    this.instance?.turnToPage(index);
  }

  /** Imperative nav with the curl animation. */
  public flipNext(): void {
    this.instance?.flipNext();
  }

  public flipPrev(): void {
    this.instance?.flipPrev();
  }
}