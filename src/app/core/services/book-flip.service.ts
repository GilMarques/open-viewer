import { Injectable, signal } from '@angular/core';

import { PageFlip, type FlipSetting } from 'page-flip';

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
 * Input routing:
 *  - Mounted with `useMouseEvents: false` so the lib never registers its
 *    own mousedown/touch listeners on the canvas.
 *  - The viewer `.stage` owns pointer events and relays page turns via
 *    `relayPointerDown/Move/Up` and `relayTap` (see PageFlip.startUserTouch).
 *  - This keeps the magnifier hold gesture and page-curl from fighting over
 *    the same pointerdown.
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
   */
  public mount(
    host: HTMLElement,
    book: Book,
    layout: 'single' | 'double',
    zoom: ZoomMode = 'stretch-to-fill',
  ): void {
    this.unmount();

    const settings: Partial<FlipSetting> = {
      width: host.clientWidth,
      height: host.clientHeight,
      showPageCorners: true,
      disableFlipByClick: false,
      ...(layout === 'single'
        ? { singlePage: true, usePortrait: true }
        : { singlePage: false, usePortrait: false }),
      startZIndex: 0,
      autoSize: false,
      drawShadow: true,
      flippingTime: 600,
      maxShadowOpacity: 0.5,
      // Viewer `.stage` relays pointer events; lib must not register its own.
      useMouseEvents: false,
    };

    const pf = new PageFlip(host, settings);
    pf.loadFromImages(book.pages.map((p) => p.url));

    pf.on('flip', (e) => {
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

  // ──────────── Pointer relay (viewer `.stage` → PageFlip API) ────────────

  /** Begin a user fold/drag at viewport coordinates. */
  public relayPointerDown(clientX: number, clientY: number): void {
    if (this.instance === null) return;
    this.instance.startUserTouch(this.toBookPoint(clientX, clientY));
  }

  /** Continue fold/drag or hover-corner preview. */
  public relayPointerMove(clientX: number, clientY: number): void {
    if (this.instance === null) return;
    this.instance.userMove(this.toBookPoint(clientX, clientY), false);
  }

  /** End fold/drag or complete a tap-to-flip. */
  public relayPointerUp(clientX: number, clientY: number): void {
    if (this.instance === null) return;
    this.instance.userStop(this.toBookPoint(clientX, clientY));
  }

  /**
   * Quick tap without a preceding relayPointerDown — page-flip never saw
   * pointerdown because `.stage` captured it for the magnifier hold timer.
   */
  public relayTap(clientX: number, clientY: number): void {
    if (this.instance === null) return;
    const pos = this.toBookPoint(clientX, clientY);
    this.instance.startUserTouch(pos);
    this.instance.userStop(pos);
  }

  /** Convert viewport coords to book-local coords (matches UI.getMousePos). */
  private toBookPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.instance!.getUI().getDistElement().getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
}
