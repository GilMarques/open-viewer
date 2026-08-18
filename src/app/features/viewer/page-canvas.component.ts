import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';

import type { Page } from '../../core/models/book.model';

/**
 * Standalone canvas renderer for a single page (image).
 *
 * v1: load the image, draw it center-and-fitted to the canvas, scaled for
 * the device pixel ratio so it stays crisp on retina. No gestures, no cache
 * yet — those come in the next pass.
 *
 * Input contract: pass the whole `Page` object (or `null` to clear). We
 * key the load off `page.url`, not `page.index`, so re-rendering the same
 * page is a no-op.
 */
@Component({
  selector: 'ov-page-canvas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stage">
      <canvas #canvas></canvas>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }
      .stage {
        display: flex;
        width: 100%;
        height: 100%;
        align-items: center;
        justify-content: center;
        background: #111;
      }
      canvas {
        max-width: 100%;
        max-height: 100%;
        touch-action: none;
      }
    `,
  ],
})
export class PageCanvasComponent {
  /** The page to render. `null` clears the canvas. */
  public readonly page = input<Page | null>(null);

  /** Computed URL we should currently be drawing. */
  private readonly currentUrl = computed(() => this.page()?.url ?? null);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>(
    'canvas',
  );

  private readonly host = inject(ElementRef<HTMLElement>);

  /** The image currently bound to the canvas. */
  private image: HTMLImageElement | null = null;
  /** URL the loaded image corresponds to. */
  private imageUrl: string | null = null;

  constructor() {
    effect(() => {
      const url = this.currentUrl();
      if (url === null) {
        this.clear();
        return;
      }
      if (url === this.imageUrl) {
        // Same page — just redraw at current size.
        this.draw();
        return;
      }
      this.loadAndDraw(url);
    });
  }

  /**
   * Load an image, then draw it. If the page changes again before the
   * load resolves, the stale callback bails out. Without this guard you
   * get the "page flickers through 2 then 3" bug on rapid prev/next.
   */
  private loadAndDraw(url: string): void {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (url !== this.currentUrl()) return; // stale
      this.image = img;
      this.imageUrl = url;
      this.draw();
    };
    img.onerror = () => {
      if (url !== this.currentUrl()) return; // stale
      this.clear();
    };
    img.src = url;
  }

  private clear(): void {
    this.image = null;
    this.imageUrl = null;
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  private draw(): void {
    const img = this.image;
    if (!img) return;

    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stage = this.host.nativeElement.querySelector('.stage') as HTMLElement;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = stage.clientWidth;
    const cssHeight = stage.clientHeight;
    canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    // Fit-contain into the canvas, centered.
    const scale = Math.min(
      canvas.width / img.naturalWidth,
      canvas.height / img.naturalHeight,
    );
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, x, y, w, h);
  }

  @HostListener('window:resize')
  public onResize(): void {
    this.draw();
  }
}