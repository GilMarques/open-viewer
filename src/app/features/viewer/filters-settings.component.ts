import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonRange,
  IonSelect,
  IonSelectOption,
  IonToggle,
  type RangeChangeEventDetail,
} from '@ionic/angular/standalone';

import type {
  FilterSettings,
  ImageSmoothMethod,
} from '../../core/models/settings.model';
import { FILTER_BOUNDS } from '../../core/models/settings.model';
import { SettingsService } from '../../core/services/settings.service';

interface SliderRow {
  readonly key: Exclude<keyof FilterSettings, 'imageSmooth'>;
  readonly label: string;
  readonly suffix: string;
  readonly icon: string;
}

interface SmoothOption {
  readonly value: ImageSmoothMethod;
  readonly label: string;
}

/** One row per slider filter. Keep the order = the order the user sees them. */
const SLIDER_ROWS: readonly SliderRow[] = [
  { key: 'brightness', label: 'Brightness', suffix: '%', icon: 'sunny' },
  { key: 'blueLight', label: 'Blue light filter', suffix: '%', icon: 'eye' },
  { key: 'contrast', label: 'Contrast', suffix: '%', icon: 'contrast' },
  { key: 'gamma', label: 'Gamma', suffix: '', icon: 'aperture' },
  { key: 'grayscale', label: 'Grayscale', suffix: '%', icon: 'color-filter' },
  { key: 'sepia', label: 'Sepia', suffix: '%', icon: 'leaf' },
  { key: 'sharpen', label: 'Sharpen', suffix: '', icon: 'diamond' },
  { key: 'blur', label: 'Blur', suffix: 'px', icon: 'water' },
  { key: 'grain', label: 'Grain', suffix: '%', icon: 'sparkles' },
];

const SMOOTH_OPTIONS: readonly SmoothOption[] = [
  { value: 'nearest-neighbor', label: 'Nearest neighbor' },
  { value: 'averaging', label: 'Averaging' },
  { value: 'bilinear', label: 'Bilinear' },
  { value: 'bicubic', label: 'Bicubic' },
  { value: 'lanczos3', label: 'Lanczos3' },
];

/**
 * Filters tab. Each row is either a (toggle, slider) pair or the image-smooth
 * toggle + sampling-method dropdown.
 *
 * Disabled sliders drop to a lower opacity but stay visible so the user knows
 * the option exists. The toggle's state drives whether the filter is applied
 * to the canvas at all — value is preserved either way.
 */
@Component({
  selector: 'ov-filters-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonRange,
    IonSelect,
    IonSelectOption,
    IonToggle,
  ],
  template: `
    <ion-list lines="none" class="filters-list">
      @for (row of sliderRows; track row.key) {
        <ion-item>
          <ion-icon
            aria-hidden="true"
            slot="start"
            [ios]="row.icon + '-outline'"
            [md]="row.icon + '-sharp'"
          ></ion-icon>
          <ion-toggle
            [checked]="getEnabled(row.key)"
            (ionChange)="onToggleChange(row.key, $event)"
            [attr.aria-label]="'Enable ' + row.label"
          ></ion-toggle>
          <ion-label>
            <h3>{{ row.label }}</h3>
            <ion-note>
              {{ getValue(row.key) }}{{ row.suffix }}
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

      <ion-item>
        <ion-icon
          aria-hidden="true"
          slot="start"
          ios="resize-outline"
          md="resize-sharp"
        ></ion-icon>
        <ion-toggle
          [checked]="imageSmoothEnabled()"
          (ionChange)="onImageSmoothToggle($event)"
          aria-label="Enable image smoothing"
        ></ion-toggle>
        <ion-label>
          <h3>Image smooth</h3>
          <ion-note>
            {{ imageSmoothLabel() }}
          </ion-note>
        </ion-label>
        <ion-select
          [value]="imageSmoothMethod()"
          (ionChange)="onImageSmoothMethodChange($event)"
          interface="popover"
          aria-label="Image smoothing method"
          class="smooth-select"
        >
          @for (opt of smoothOptions; track opt.value) {
            <ion-select-option [value]="opt.value">{{ opt.label }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
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
      ion-item ion-icon[slot='start'] {
        color: var(--ion-color-medium);
        font-size: 22px;
      }
      .smooth-select {
        min-width: 140px;
      }
    `,
  ],
})
export class FiltersSettingsComponent {
  private readonly settings = inject(SettingsService);

  public readonly sliderRows = SLIDER_ROWS;
  public readonly smoothOptions = SMOOTH_OPTIONS;
  public readonly bounds = FILTER_BOUNDS;

  /** Live snapshot of the filters object — recomputed whenever settings change. */
  private readonly filters = computed(() => this.settings.settings().filters);

  public getEnabled(key: Exclude<keyof FilterSettings, 'imageSmooth'>): boolean {
    return this.filters()[key].enabled;
  }

  public getValue(key: Exclude<keyof FilterSettings, 'imageSmooth'>): number {
    return this.filters()[key].value;
  }

  public readonly imageSmoothEnabled = computed(() => this.filters().imageSmooth.enabled);
  public readonly imageSmoothMethod = computed(() => this.filters().imageSmooth.method);

  public imageSmoothLabel(): string {
    const opt = SMOOTH_OPTIONS.find((o) => o.value === this.imageSmoothMethod());
    return opt?.label ?? this.imageSmoothMethod();
  }

  public onToggleChange(
    key: Exclude<keyof FilterSettings, 'imageSmooth'>,
    event: CustomEvent<{ checked: boolean }>,
  ): void {
    const current = this.filters()[key];
    this.settings.setFilter(key, event.detail.checked, current.value);
  }

  public onSliderChange(
    key: Exclude<keyof FilterSettings, 'imageSmooth'>,
    event: CustomEvent<RangeChangeEventDetail>,
  ): void {
    const raw = firstNumeric(event.detail.value);
    const current = this.filters()[key];
    this.settings.setFilter(key, current.enabled, raw);
  }

  public onImageSmoothToggle(event: CustomEvent<{ checked: boolean }>): void {
    this.settings.setImageSmooth(event.detail.checked, this.imageSmoothMethod());
  }

  public onImageSmoothMethodChange(event: CustomEvent<{ value: ImageSmoothMethod | undefined }>): void {
    const v = event.detail.value;
    if (v === undefined) return;
    if (
      v === 'nearest-neighbor' ||
      v === 'averaging' ||
      v === 'bilinear' ||
      v === 'bicubic' ||
      v === 'lanczos3'
    ) {
      this.settings.setImageSmooth(this.imageSmoothEnabled(), v);
    }
  }
}

/** Extract the first numeric value from a RangeValue. Single-thumb ranges
 *  pass a number; dual-thumb ranges pass { lower, upper } or [lower, upper].
 *  Anything else falls back to NaN so the service receives a sane value
 *  to clamp. */
function firstNumeric(value: unknown): number {
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && typeof value[0] === 'number') return value[0];
  if (value !== null && typeof value === 'object' && 'lower' in value && typeof value.lower === 'number') {
    return value.lower;
  }
  return Number.NaN;
}
