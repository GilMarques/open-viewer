import { Injectable, signal } from '@angular/core';

/**
 * Shared magnifier / pointer-gesture state.
 *
 * Written by the viewer page (pointer pipeline + hold timer).
 * The viewer uses `relayFlip` to hand a drag off to page-flip once slop
 * is exceeded; `relayPan` does the same for oversized pages. While holding
 * (before loupe or relay) page-flip must stay idle.
 */
@Injectable({ providedIn: 'root' })
export class MagnifierStateService {
  /** Pointer is down on `.stage` (hold window or loupe). */
  private readonly _holding = signal(false);
  public readonly holding = this._holding.asReadonly();

  /** Loupe is visible (hold timer elapsed). */
  private readonly _active = signal(false);
  public readonly active = this._active.asReadonly();

  /** Drag exceeded slop — viewer relays to page-flip instead of magnifier. */
  private readonly _relayFlip = signal(false);
  public readonly relayFlip = this._relayFlip.asReadonly();

  /** Drag exceeded slop — viewer pans an oversized page instead of curling. */
  private readonly _relayPan = signal(false);
  public readonly relayPan = this._relayPan.asReadonly();

  public setHolding(value: boolean): void {
    this._holding.set(value);
  }

  public setActive(value: boolean): void {
    this._active.set(value);
  }

  public setRelayFlip(value: boolean): void {
    this._relayFlip.set(value);
  }

  public setRelayPan(value: boolean): void {
    this._relayPan.set(value);
  }

  /** Reset all gesture flags (pointer up, blur, visibility change). */
  public endGesture(): void {
    this._holding.set(false);
    this._active.set(false);
    this._relayFlip.set(false);
    this._relayPan.set(false);
  }
}
