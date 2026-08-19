import { Injectable, inject, signal } from '@angular/core';

import { PageFlip, type FlipSetting } from 'page-flip';

import type { Book } from '../models/book.model';
import type { ZoomMode } from '../models/settings.model';
import { BookstoreService } from './bookstore.service';

type NaturalSize = { readonly width: number; readonly height: number };

/** Page-flip state machine values delivered by the lib's `changeState` event. */
export type FlipGestureState = 'user_fold' | 'fold_corner' | 'flipping' | 'read';

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
 *
 * Remount note: PageFlip.destroy() removes the host element from the DOM.
 * unmount() only tears down the lib UI so Angular's host ref stays attached.
 */
@Injectable({ providedIn: 'root' })
export class BookFlipService {
  private readonly bookstore = inject(BookstoreService);

  private instance: PageFlip | null = null;
  private host: HTMLElement | null = null;
  private mountGeneration = 0;

  /** Latest page-flip state from the lib's `changeState` event. */
  private readonly _flipState = signal<FlipGestureState | null>(null);
  public readonly flipState = this._flipState.asReadonly();

  /** Reactive current page index (0-based), mirrored from the lib. */
  private readonly _currentIndex = signal(0);
  public readonly currentIndex = this._currentIndex.asReadonly();

  /** True while a PageFlip instance is mounted and ready. */
  private readonly _mounted = signal(false);
  public readonly mounted = this._mounted.asReadonly();

  /**
   * Mount a PageFlip instance on `host` and load all pages from `book`.
   * Destroys any previous instance first. Preserves the current page index
   * across remounts (layout / zoom changes).
   */
  public mount(
    host: HTMLElement,
    book: Book,
    layout: 'single' | 'double',
    zoom: ZoomMode = 'fit-screen',
  ): void {
    const pageIndex = Math.max(0, Math.min(this._currentIndex(), book.pages.length - 1));
    const url = book.pages[pageIndex]?.url ?? book.pages[0]?.url;
    if (url === undefined) return;

    this.unmount();
    this.host = host;
    this.resetHost(host);

    const generation = ++this.mountGeneration;

    void this.loadImageNaturalSize(url).then((natural) => {
      if (generation !== this.mountGeneration || this.host !== host) return;
      if (!host.isConnected) return;

      const containerW = host.clientWidth;
      const containerH = host.clientHeight;
      if (containerW <= 0 || containerH <= 0) return;

      const pageSize = computePageDimensions(containerW, containerH, natural, zoom, layout);

      const settings: Partial<FlipSetting> = {
        width: pageSize.width,
        height: pageSize.height,
        startPage: pageIndex,
        showPageCorners: true,
        disableFlipByClick: false,
        ...(layout === 'single'
          ? { usePortrait: true }
          : { usePortrait: false }),
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
          this.syncPageIndex(e.data);
        }
      });

      // Mirror the lib's state machine (user_fold → fold_corner → flipping →
      // read) so the viewer can gate gesture handling on it.
      pf.on('changeState', (e) => {
        const s = e.data;
        if (s === 'user_fold' || s === 'fold_corner' || s === 'flipping' || s === 'read') {
          this._flipState.set(s);
        }
      });

      this.instance = pf;
      this.syncPageIndex(pf.getCurrentPageIndex());
      this._mounted.set(true);
    });
  }

  /** Tear down the current instance if any. Idempotent. Keeps the host in the DOM. */
  public unmount(): void {
    this.mountGeneration++;
    this._flipState.set(null);
    if (this.instance === null) return;
    try {
      // Do NOT call PageFlip.destroy() — it removes the host from the DOM.
      this.instance.getUI().destroy();
    } catch {
      // destroy() can throw if the host was already detached. Swallow.
    }
    if (this.host !== null) {
      this.resetHost(this.host);
    }
    this.instance = null;
    this.host = null;
    this._mounted.set(false);
  }

  /** Tell the lib its container size changed (e.g. orientation flip). */
  public update(): void {
    this.instance?.update();
  }

  /** Viewport rect of the rendered page canvas, or null when not mounted. */
  public getPageElementRect(): DOMRect | null {
    if (this.instance === null) return null;
    try {
      return this.instance.getUI().getDistElement().getBoundingClientRect();
    } catch {
      return null;
    }
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
   * Commit an active fold gesture in the requested direction. Uses the
   * public animated flipNext/flipPrev instead of userStop so page-flip's
   * geometric snap-back heuristic (position.x <= 0 or animate back) never
   * decides the outcome — any started curl turns the page on release.
   */
  public finishFlipGesture(direction: 'next' | 'prev'): void {
    if (this.instance === null) return;
    if (direction === 'next') this.instance.flipNext();
    else this.instance.flipPrev();
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

  /** Strip page-flip DOM/state from the host so a fresh instance can mount. */
  private resetHost(host: HTMLElement): void {
    host.replaceChildren();
    host.classList.remove('stf__parent');
    host.style.removeProperty('min-width');
    host.style.removeProperty('min-height');
    host.style.removeProperty('width');
    host.style.removeProperty('max-width');
    host.style.removeProperty('display');
  }

  private loadImageNaturalSize(url: string): Promise<NaturalSize> {
    return new Promise((resolve) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        resolve({
          width: Math.max(1, img.naturalWidth),
          height: Math.max(1, img.naturalHeight),
        });
      };
      img.onerror = () => resolve({ width: 800, height: 1200 });
      img.src = url;
    });
  }

  /** Keep BookstoreService in sync so magnifier / progress track the visible page. */
  private syncPageIndex(index: number): void {
    this._currentIndex.set(index);
    this.bookstore.goTo(index);
  }
}

/** Map Display > Zoom to page-flip page dimensions (per-page leaf size). */
export function computePageDimensions(
  containerW: number,
  containerH: number,
  image: NaturalSize,
  zoom: ZoomMode,
  layout: 'single' | 'double',
): { width: number; height: number } {
  const pageContainerW = layout === 'double' ? containerW / 2 : containerW;
  const pageContainerH = containerH;

  const iw = image.width;
  const ih = image.height;
  const aspect = iw / ih;

  let pageW = pageContainerW;
  let pageH = pageContainerH;

  switch (zoom) {
    case 'actual-size':
      pageW = iw;
      pageH = ih;
      break;
    case 'fit-width':
      pageW = pageContainerW;
      pageH = pageContainerW / aspect;
      break;
    case 'fit-height':
      pageH = pageContainerH;
      pageW = pageContainerH * aspect;
      break;
    case 'fit-screen': {
      const scale = Math.min(pageContainerW / iw, pageContainerH / ih);
      pageW = iw * scale;
      pageH = ih * scale;
      break;
    }
    case 'cover': {
      const scale = Math.max(pageContainerW / iw, pageContainerH / ih);
      pageW = iw * scale;
      pageH = ih * scale;
      break;
    }
    case 'fixed-size':
      // Numeric picker is out of v1 scope — treat as fit-screen.
    case 'stretch-to-fill':
    default:
      pageW = pageContainerW;
      pageH = pageContainerH;
      break;
  }

  return {
    width: Math.max(1, Math.round(pageW)),
    height: Math.max(1, Math.round(pageH)),
  };
}
