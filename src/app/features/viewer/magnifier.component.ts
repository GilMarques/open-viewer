import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Loupe overlay rendered when the user holds a pointer on the page.
 *
 * Geometry:
 *   - The visible page lives inside `.stage`. We capture its rect
 *     (hostRect) and the pointer's viewport coords (pointerX/Y).
 *   - The pointer's fractional position inside the stage maps to the
 *     page image's natural pixel coords.
 *   - We render a square snippet (~22% of the smaller viewport axis)
 *     inside a fixed-position div at the corner OPPOSITE the pointer.
 *   - Background-image is the page URL, sized 1:1 to the natural
 *     dimensions, then transformed by the user's magnifierZoom.
 *     background-position offsets so the pixel under the pointer lands
 *     at the centre of the visible square.
 *
 * Why CSS background-image rather than a canvas: zero JS per move, the
 * browser caches the image, and we don't fight page-flip's transform
 * pipeline (we sample the source image, not the rendered canvas).
 */
@Component({
  selector: 'ov-magnifier',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div
        class="loupe"
        [class.tl]="placement() === 'tl'"
        [class.tr]="placement() === 'tr'"
        [class.bl]="placement() === 'bl'"
        [class.br]="placement() === 'br'"
        [style.background-image]="backgroundImage()"
        [style.background-size.px]="backgroundSize()"
        [style.background-position]="backgroundPosition()"
        [style.width.px]="loupeSizePx()"
        [style.height.px]="loupeSizePx()"
        [style.transform]="'scale(' + zoom() + ')'"
        [style.transformOrigin]="transformOrigin()"
        aria-hidden="true"
      ></div>
    }
  `,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 5;
      }
      .loupe {
        position: absolute;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        background-repeat: no-repeat;
        background-color: #000;
        transform-origin: center center;
      }
      .loupe.tl { top: 3vmin; left: 3vmin; }
      .loupe.tr { top: 3vmin; right: 3vmin; }
      .loupe.bl { bottom: 3vmin; left: 3vmin; }
      .loupe.br { bottom: 3vmin; right: 3vmin; }
    `,
  ],
})
export class MagnifierComponent {
  /** Whether the loupe should be shown. */
  public readonly active = input<boolean>(false);

  /** Page image URL — used as the background-image source. */
  public readonly pageUrl = input<string | null>(null);

  /** Pointer X in viewport coords. */
  public readonly pointerX = input<number>(0);

  /** Pointer Y in viewport coords. */
  public readonly pointerY = input<number>(0);

  /** The .stage element's bounding rect (viewport-relative). */
  public readonly hostRect = input<DOMRect | null>(null);

  /** Page image's natural pixel dimensions. */
  public readonly naturalWidth = input<number>(0);
  public readonly naturalHeight = input<number>(0);

  /** Magnification factor from settings. 1 = no zoom. */
  public readonly zoom = input<number>(1);

  /** Viewport size (used for placement and loupe sizing). */
  public readonly viewportWidth = input<number>(0);
  public readonly viewportHeight = input<number>(0);

  /** Loupe window side length — ~22% of the smaller viewport axis. */
  private static readonly LOUPE_VIEWPORT_FRACTION = 0.22;

  public readonly loupeSizePx = computed(() => {
    const vw = this.viewportWidth();
    const vh = this.viewportHeight();
    if (vw === 0 || vh === 0) return 160;
    return Math.round(Math.min(vw, vh) * MagnifierComponent.LOUPE_VIEWPORT_FRACTION);
  });

  public readonly visible = computed(() => {
    if (!this.active()) return false;
    if (this.pageUrl() === null) return false;
    if (this.hostRect() === null) return false;
    if (this.naturalWidth() === 0 || this.naturalHeight() === 0) return false;
    const rect = this.hostRect()!;
    const px = this.pointerX();
    const py = this.pointerY();
    // Pointer must be inside the visible stage.
    return (
      px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom
    );
  });

  /** Where to dock the loupe: opposite diagonal of the pointer. */
  public readonly placement = computed<'tl' | 'tr' | 'bl' | 'br'>(() => {
    const vw = this.viewportWidth();
    const vh = this.viewportHeight();
    if (vw === 0 || vh === 0) return 'tl';
    return this.pointerX() < vw / 2
      ? this.pointerY() < vh / 2
        ? 'br'
        : 'tr'
      : this.pointerY() < vh / 2
        ? 'bl'
        : 'tl';
  });

  /** Fractional pointer position inside the visible stage. */
  private readonly pointerFraction = computed<{ fx: number; fy: number } | null>(() => {
    const rect = this.hostRect();
    if (rect === null || rect.width === 0 || rect.height === 0) return null;
    return {
      fx: (this.pointerX() - rect.left) / rect.width,
      fy: (this.pointerY() - rect.top) / rect.height,
    };
  });

  public readonly backgroundImage = computed(() => {
    const url = this.pageUrl();
    return url === null ? 'none' : `url("${url}")`;
  });

  /**
   * CSS background-size in CSS pixels (px units). The background is sized
   * so the page image fills the loupe at 1:1 plus the user's zoom factor.
   */
  public readonly backgroundSize = computed<number>(() => {
    const frac = this.pointerFraction();
    if (frac === null) return 0;
    const nw = this.naturalWidth();
    const nh = this.naturalHeight();
    return Math.max(nw, nh) * this.zoom();
  });

  /**
   * CSS background-position offsets (x, y) in CSS pixels. Computed so
   * that the pixel currently under the pointer lands at the centre of
   * the loupe window.
   */
  public readonly backgroundPosition = computed<string>(() => {
    const frac = this.pointerFraction();
    if (frac === null) return '0px 0px';
    const nw = this.naturalWidth();
    const nh = this.naturalHeight();
    const bgSize = this.backgroundSize();
    const half = this.loupeSizePx() / 2;
    const srcX = frac.fx * nw;
    const srcY = frac.fy * nh;
    const bgX = srcX * (bgSize / nw);
    const bgY = srcY * (bgSize / nh);
    return `${-bgX + half}px ${-bgY + half}px`;
  });

  public transformOrigin(): string {
    return 'center center';
  }
}
