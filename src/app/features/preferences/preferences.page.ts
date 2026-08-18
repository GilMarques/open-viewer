import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonNote,
  IonRange,
  IonTitle,
  IonToolbar,
  type RangeChangeEventDetail,
} from '@ionic/angular/standalone';

import { MAGNIFIER_BOUNDS } from '../../core/models/settings.model';
import { SettingsService } from '../../core/services/settings.service';

@Component({
  selector: 'ov-preferences',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonButtons,
    IonContent,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonNote,
    IonRange,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-menu-button></ion-menu-button>
        </ion-buttons>
        <ion-title>Preferences</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list lines="none">
        <ion-item>
          <ion-label>
            <h3>Magnifier zoom</h3>
            <ion-note>
              {{ zoomValue() }}× — applied when holding a pointer on a page
            </ion-note>
          </ion-label>
        </ion-item>
        <ion-item class="slider-row">
          <ion-range
            [min]="bounds.min"
            [max]="bounds.max"
            [step]="bounds.step"
            [value]="zoomValue()"
            (ionInput)="onZoomChange($event)"
            aria-label="Magnifier zoom"
          >
            <ion-note slot="start">{{ bounds.min }}</ion-note>
            <ion-note slot="end">{{ bounds.max }}</ion-note>
          </ion-range>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
  styles: [
    `
      .slider-row {
        --min-height: 32px;
        padding-inline: 12px;
      }
    `,
  ],
})
export class PreferencesPage {
  private readonly settings = inject(SettingsService);
  public readonly bounds = MAGNIFIER_BOUNDS;

  public readonly zoomValue = computed(() =>
    this.settings.settings().display.magnifierZoom,
  );

  public onZoomChange(event: CustomEvent<RangeChangeEventDetail>): void {
    const raw = event.detail.value;
    const value = typeof raw === 'number' ? raw : Number.NaN;
    if (!Number.isFinite(value)) return;
    this.settings.setMagnifierZoom(value);
  }
}
