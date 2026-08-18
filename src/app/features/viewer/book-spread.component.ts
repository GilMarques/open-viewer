import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { BookFlipService } from '../../core/services/book-flip.service';
import { SettingsService } from '../../core/services/settings.service';
import { BookstoreService } from '../../core/services/bookstore.service';
import type { Book } from '../../core/models/book.model';
import type { PageLayout, ZoomMode } from '../../core/models/settings.model';

/**
 * The host for a `page-flip` instance. Mounts the flip lib on its
 * element ref, forwards layout/zoom-gating signals, and tears down on
 * destroy.
 *
 * Inputs:
 *   - book: the open book. When the identity changes, the spread remounts.
 *
 * The host element gets explicit width/height (CSS sets it to fill its
 * parent). The lib measures the host; a 0-size host = no curl surface.
 */
@Component({
  selector: 'ov-book-spread',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="spread-host"></div>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .spread-host {
        position: relative;
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class BookSpreadComponent implements AfterViewInit, OnDestroy {
  /** Open book; identity change → remount. */
  public readonly book = input<Book | null>(null);

  private readonly hostRef = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly flip = inject(BookFlipService);
  private readonly bookstore = inject(BookstoreService);
  private readonly settings = inject(SettingsService);

  /**
   * Map the user-facing PageLayout setting to the lib's two modes.
   * 'default' / 'auto-single' → single-page; 'auto-dual' → spread;
   * 'auto-switch' → single (we don't yet switch on orientation).
   */
  public readonly layout = computed<'single' | 'double'>(() => {
    const layout: PageLayout = this.settings.settings().display.pageLayout;
    if (layout === 'auto-dual') return 'double';
    return 'single';
  });

  /** Current zoom mode. Passed to the lib on mount; v1 doesn't differentiate
   *  the modes visually yet (the page-flip renderer always stretches to the
   *  host), but the value is persisted and a remount fires on change so
   *  the wiring is in place for the v2 native renderer. */
  public readonly zoom = computed<ZoomMode>(() => this.settings.settings().display.zoom);

  constructor() {
    // Remount the flip instance whenever the book OR layout changes.
    effect(() => {
      const book = this.book();
      const layout = this.layout();
      const zoom = this.zoom();
      if (book === null) return;
      // Read the host element; if the view isn't initialized yet, skip —
      // ngAfterViewInit will handle the initial mount.
      const host = this.hostRef()?.nativeElement;
      if (host === undefined) return;
      this.flip.mount(host, book, layout, zoom);
    });

    // Gate the lib's curl gesture on `cornersVisible()`.
    effect(() => {
      const visible = this.bookstore.cornersVisible();
      this.flip.setFlippingEnabled(visible);
    });
  }

  public ngAfterViewInit(): void {
    // First mount — the effect above may have already run with `host`
    // still undefined. Do it again now that the view exists.
    const book = this.book();
    if (book === null) return;
    const host = this.hostRef().nativeElement;
    this.flip.mount(host, book, this.layout(), this.zoom());
  }

  public ngOnDestroy(): void {
    this.flip.unmount();
  }

  /** Tell the lib the container resized. */
  @HostListener('window:resize')
  public onResize(): void {
    this.flip.update();
  }
}