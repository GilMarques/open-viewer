import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRange,
  IonToggle,
  type RangeChangeEventDetail,
} from '@ionic/angular/standalone';

import type { FilterSettings } from '../../core/models/settings.model';
import { FILTER_BOUNDS } from '../../core/models/settings.model';
import { SettingsService } from '../../core/services/settings.service';

interface FilterRow {
  readonly key: keyof FilterSettings;
  readonly label: string;
  readonly suffix: string;
}

/** One row per filter. Keep the order = the order the user sees them. */
const FILTER_ROWS: readonly FilterRow[] = [
  { key: 'brightness', label: 'Brightness', suffix: '%' },
  { key: 'blueLight', label: 'Blue light filter', suffix: '%' },
  { key: 'contrast', label: 'Contrast', suffix: '%' },
  { key: 'gamma', label: 'Gamma', suffix: '' },
];

/**
 * Filters tab. Each row is a (toggle, slider) pair bound to one FilterSlider.
 *
 * Disabled sliders drop to a lower opacity but stay visible so the user knows
 * the option exists. The toggle's state drives whether the filter is applied
 * to the canvas at all — value is preserved either way.
 */
@Component({
  selector: 'ov-filters-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonItem, IonLabel, IonList, IonNote, IonRange, IonToggle],
  template: `
    <ion-list lines="full" class="filters-list">
      @for (row of rows; track row.key) {
        <ion-item>
          <ion-toggle
            [checked]="getEnabled(row.key)"
            (ionChange)="onToggleChange(row.key, $event)"
            slot="start"
            [attr.aria-label]="'Enable ' + row.label"
          ></ion-toggle>
          <ion-label>
            <h3>{{ row.label }}</h3>
            <ion-note>
              {{ getValue(row.key) }}{{ row.suffix }}
              @if (!getEnabled(row.key)) {
                &nbsp;(disabled)
              }
            </ion-note>
          </ion-label>
        </ion-item>
        <ion-item class="slider-row" [class.is-disabled]="!getEnabled(row.key)">
          <ion-range
            [min]="bounds[row.key].min"
            [max]="bounds[row.key].max"
            [step]="bounds[row.key].step"
            [value]="getValue(row.key)"
            (ionInput)="onSliderChange(row.key, $event)"
            [disabled]="!getEnabled(row.key)"
            [attr.aria-label]="row.label + ' slider'"
          >
            <ion-note slot="start">{{ bounds[row.key].min }}</ion-note>
            <ion-note slot="end">{{ bounds[row.key].max }}</ion-note>
          </ion-range>
        </ion-item>
      }
    </ion-list>
  `,
  styles: [
    `
      .filters-list {
        padding-top: 8px;
      }
      .slider-row {
        --min-height: 32px;
        padding-inline: 12px;
      }
      .slider-row.is-disabled {
        opacity: 0.55;
      }
    `,
  ],
})
export class FiltersSettingsComponent {
  private readonly settings = inject(SettingsService);

  public readonly rows = FILTER_ROWS;
  public readonly bounds = FILTER_BOUNDS;

  /** Live snapshot of the filters object — recomputed whenever settings change. */
  private readonly filters = computed(() => this.settings.settings().filters);

  public getEnabled(key: keyof FilterSettings): boolean {
    return this.filters()[key].enabled;
  }

  public getValue(key: keyof FilterSettings): number {
    return this.filters()[key].value;
  }

  public onToggleChange(key: keyof FilterSettings, event: CustomEvent<{ checked: boolean }>): void {
    const current = this.filters()[key];
    this.settings.setFilter(key, event.detail.checked, current.value);
  }
  public onSliderChange(key: keyof FilterSettings, event: CustomEvent<RangeChangeEventDetail>): void {
    const raw = firstNumeric(event.detail.value);
    const current = this.filters()[key];
    this.settings.setFilter(key, current.enabled, raw);
  }
}

/** Extract the first numeric value from a RangeValue. Single-thumb ranges
 *  pass a number; dual-thumb ranges pass { lower, upper } or [lower, upper].
 *  Anything else falls back to the bound's min so the service receives a
 *  sane value to clamp. */
function firstNumeric(value: unknown): number {
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && typeof value[0] === 'number') return value[0];
  if (value !== null && typeof value === 'object' && 'lower' in value && typeof value.lower === 'number') {
    return value.lower;
  }
  return Number.NaN;
}