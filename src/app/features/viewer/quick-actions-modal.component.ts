import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import {
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

import { DisplaySettingsComponent } from './display-settings.component';
import { FiltersSettingsComponent } from './filters-settings.component';

type QuickActionsTab = 'menu' | 'display' | 'filters';

interface QuickActionEntry {
  readonly title: string;
  readonly url: string;
  readonly icon: string;
}

/**
 * Modal sheet with tabbed quick actions.
 *
 * v1: three tabs.
 *   - "Main menu" — mirror of the side-drawer entries. Tap → navigates and
 *                    closes the modal.
 *   - "Display"   — reading-direction, page-layout, theme, viewer-mode,
 *                    page-transition, orientation controls.
 *   - "Filters"   — brightness / blue light / contrast / gamma sliders.
 *
 * Future tabs (settings, bookmarks, etc.) slot in without changing this
 * component's contract — add to the QuickActionsTab union and the
 * `@switch` / `@else if` ladder in the template.
 */
@Component({
  selector: 'ov-quick-actions-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DisplaySettingsComponent,
    FiltersSettingsComponent,

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
              <ion-label>Main menu</ion-label>
            </ion-segment-button>
            <ion-segment-button value="display">
              <ion-label>Display</ion-label>
            </ion-segment-button>
            <ion-segment-button value="filters">
              <ion-label>Filters</ion-label>
            </ion-segment-button>
          </ion-segment>
        </ion-toolbar>

        <ion-content>
          @switch (activeTab()) {
            @case ('menu') {
              <ion-list lines="none">
                @for (entry of menu; track entry.url) {
                  <ion-item
                    button
                    [detail]="false"
                    (click)="navigateTo(entry.url)"
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
            }
            @case ('display') {
              <ov-display-settings />
            }
            @case ('filters') {
              <ov-filters-settings />
            }
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
      /* Drop the dim layer so the reader stays visible behind the sheet. */
      ion-modal::part(backdrop) {
        background: transparent;
      }
      /* Translucent sheet — let the reader bleed through the panel. */
      ion-modal::part(content) {
        background: color-mix(in srgb, var(--ion-background-color, #fff) 70%, transparent);
        backdrop-filter: blur(12px);
      }
    `,
  ],
})
export class QuickActionsModalComponent {
  private readonly router = inject(Router);

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
   * `EventEmitter<CustomEvent<SegmentChangeEventDetail>>`. Narrow
   * `value` (`SegmentValue | undefined`) to our union of tabs.
   */
  public onTabChange(event: CustomEvent<SegmentChangeEventDetail>): void {
    const value = event.detail.value;
    if (value === 'menu' || value === 'display' || value === 'filters') {
      this._activeTab.set(value);
    }
  }

  public close(): void {
    this.didDismiss.emit();
  }

  /** Main-menu row tap — dismiss sheet then route (routerLink is unreliable inside ion-modal). */
  public navigateTo(url: string): void {
    this.didDismiss.emit();
    void this.router.navigateByUrl(url);
  }
}
