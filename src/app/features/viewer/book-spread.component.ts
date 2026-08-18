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
import type { Book } from '../../core/models/book.model';
import type { PageLayout, ZoomMode } from '../../core/models/settings.model';

/**
 * Host for a page-flip instance. Mounts the lib on its element ref and
 * remounts when book / layout / zoom changes. Pointer input is owned by
 * the viewer `.stage` (useMouseEvents: false on mount).
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
  private readonly settings = inject(SettingsService);

  public readonly layout = computed<'single' | 'double'>(() => {
    const layout: PageLayout = this.settings.settings().display.pageLayout;
    if (layout === 'auto-dual') return 'double';
    return 'single';
  });

  public readonly zoom = computed<ZoomMode>(() => this.settings.settings().display.zoom);

  constructor() {
    effect(() => {
      const book = this.book();
      const layout = this.layout();
      const zoom = this.zoom();
      if (book === null) return;
      const host = this.hostRef()?.nativeElement;
      if (host === undefined) return;
      this.flip.mount(host, book, layout, zoom);
    });
  }

  public ngAfterViewInit(): void {
    const book = this.book();
    if (book === null) return;
    const host = this.hostRef().nativeElement;
    this.flip.mount(host, book, this.layout(), this.zoom());
  }

  public ngOnDestroy(): void {
    this.flip.unmount();
  }

  @HostListener('window:resize')
  public onResize(): void {
    this.flip.update();
  }
}
