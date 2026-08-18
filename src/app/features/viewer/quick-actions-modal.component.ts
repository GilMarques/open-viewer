import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
  type SegmentChangeEventDetail,
} from '@ionic/angular/standalone';

type QuickActionsTab = 'menu' | 'more';

interface QuickActionEntry {
  readonly title: string;
  readonly url: string;
  readonly icon: string;
}

/**
 * Modal sheet with tabbed quick actions.
 *
 * v1: two tabs.
 *   - "Menu"   — mirror of the side-drawer entries (Viewer, Bookshelf,
 *                File Browser, Preferences, About). Tap → navigates and
 *                closes the modal.
 *   - "More"   — placeholder for future quick actions.
 *
 * Future tabs (page navigation, settings, bookmarks, etc.) slot in
 * without changing this component's contract.
 */
@Component({
  selector: 'ov-quick-actions-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IonButton,
    IonContent,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonModal,
    IonSegment,
    IonSegmentButton,
    IonToolbar,
  ],
  template: `
    <ion-modal
      [isOpen]="isOpen()"
      [breakpoints]="[0, 0.5, 0.9]"
      [initialBreakpoint]="0.5"
      (didDismiss)="didDismiss.emit()"
    >
      <ng-template>
        <ion-toolbar>
          <ion-segment [value]="activeTab()" (ionChange)="onTabChange($event)">
            <ion-segment-button value="menu">
              <ion-label>Menu</ion-label>
            </ion-segment-button>
            <ion-segment-button value="more">
              <ion-label>More</ion-label>
            </ion-segment-button>
          </ion-segment>
          <ion-button slot="end" fill="clear" (click)="close()">Close</ion-button>
        </ion-toolbar>

        <ion-content>
          @if (activeTab() === 'menu') {
            <ion-list>
              @for (entry of menu; track entry.url) {
                <ion-item
                  button
                  [routerLink]="[entry.url]"
                  (click)="close()"
                  lines="none"
                >
                  <ion-icon
                    aria-hidden="true"
                    slot="start"
                    [ios]="entry.icon + '-outline'"
                    [md]="entry.icon + '-sharp'"
                  ></ion-icon>
                  <ion-label>{{ entry.title }}</ion-label>
                </ion-item>
              }
            </ion-list>
          } @else {
            <div class="placeholder">
              <p>More quick actions will live here.</p>
            </div>
          }
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: [
    `
      ion-segment {
        flex: 1 1 auto;
      }
      .placeholder {
        padding: 32px 24px;
        opacity: 0.6;
        text-align: center;
      }
    `,
  ],
})
export class QuickActionsModalComponent {
  /** Whether the modal is visible. Two-way bound by the parent. */
  public readonly isOpen = input<boolean>(false);

  /** Fires when the modal is dismissed by any means (tap, swipe, backdrop, X). */
  public readonly didDismiss = output<void>();

  public readonly menu: readonly QuickActionEntry[] = [
    { title: 'Viewer', url: '/viewer', icon: 'book' },
    { title: 'Bookshelf', url: '/bookshelf', icon: 'library' },
    { title: 'File Browser', url: '/file-browser', icon: 'folder' },
    { title: 'Preferences', url: '/preferences', icon: 'settings' },
    { title: 'About', url: '/about', icon: 'information-circle' },
  ];

  private readonly _activeTab = signal<QuickActionsTab>('menu');
  public readonly activeTab = this._activeTab.asReadonly();

  /**
   * Ionic types the segment `ionChange` event as
   * `EventEmitter<CustomEvent<SegmentChangeEventDetail>>`. The handler
   * narrows `value` (`SegmentValue | undefined`) to our union of tabs.
   */
  public onTabChange(event: CustomEvent<SegmentChangeEventDetail>): void {
    const value = event.detail.value;
    if (value === 'menu' || value === 'more') {
      this._activeTab.set(value);
    }
  }

  public close(): void {
    this.didDismiss.emit();
  }
}