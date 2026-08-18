import { Injectable, signal } from '@angular/core';

/**
 * Tiny shared store for the magnifier's "active" state.
 *
 * Owned (written) by the viewer page — it owns the pointer-event pipeline
 * and the hold-delay timer. Read by the book-spread component so it can
 * gate page-flip's curl gesture off while the loupe is showing (the
 * gesture and the loupe both want to react to the same pointerdown).
 *
 * Keeping this in its own service avoids the viewer having to template-
 * bind a signal into the spread's inputs, and avoids putting viewer-only
 * UX state on BookstoreService.
 */
@Injectable({ providedIn: 'root' })
export class MagnifierStateService {
  private readonly _active = signal(false);
  public readonly active = this._active.asReadonly();

  public setActive(value: boolean): void {
    this._active.set(value);
  }
}
