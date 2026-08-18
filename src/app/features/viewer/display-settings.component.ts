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
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonToggle,
  type SegmentChangeEventDetail,
} from '@ionic/angular/standalone';

import type {
  InterfaceTheme,
  PageLayout,
  PageTransition,
  ScreenOrientation,
  ViewerMode,
} from '../../core/models/settings.model';
import { SettingsService } from '../../core/services/settings.service';

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
}

const PAGE_LAYOUT_OPTIONS: readonly Option<PageLayout>[] = [
  { value: 'default', label: 'Default' },
  { value: 'auto-single', label: 'Auto single page' },
  { value: 'auto-dual', label: 'Auto dual page' },
  { value: 'auto-switch', label: 'Auto switch' },
];

const THEME_OPTIONS: readonly Option<InterfaceTheme>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const VIEWER_MODE_OPTIONS: readonly Option<ViewerMode>[] = [
  { value: 'paged', label: 'Page mode' },
  { value: 'vertical-scroll', label: 'Vertical scroll' },
  { value: 'horizontal-scroll', label: 'Horizontal scroll' },
];

const PAGE_TRANSITION_OPTIONS: readonly Option<PageTransition>[] = [
  { value: 'none', label: 'None' },
  { value: 'slide-horizontal', label: 'Slide left/right' },
  { value: 'slide-vertical', label: 'Slide up/down' },
  { value: 'page-curl', label: 'Page curl (soon)' },
];

const ORIENTATION_OPTIONS: readonly Option<ScreenOrientation>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'portrait-inverted', label: 'Portrait (inverted)' },
  { value: 'landscape-inverted', label: 'Landscape (inverted)' },
  { value: 'default', label: 'Default' },
];

/**
 * Display settings tab. All options read/write through SettingsService.
 *
 * Page origin is intentionally absent — its purpose is undecided (see the
 * Linear issue GIL-30 scope locks). Don't add it back until the design
 * intent is settled.
 */
@Component({
  selector: 'ov-display-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonToggle,
  ],
  template: `
    <ion-list lines="full" class="settings-list">
      <ion-item>
        <ion-label>Reading direction</ion-label>
        <ion-toggle
          [checked]="isRtl()"
          (ionChange)="onReadingDirectionChange($event)"
          aria-label="Toggle reading direction"
        ></ion-toggle>
      </ion-item>
      <ion-item>
        <ion-label>Direction</ion-label>
        <ion-note slot="end">{{ isRtl() ? 'Right → left' : 'Left → right' }}</ion-note>
      </ion-item>

      <ion-item>
        <ion-label>Screen orientation</ion-label>
        <ion-select
          [value]="orientation()"
          (ionChange)="onOrientationChange($event)"
          interface="popover"
          aria-label="Screen orientation"
        >
          @for (opt of orientations; track opt.value) {
            <ion-select-option [value]="opt.value">{{ opt.label }}</ion-select-option>
          }
        </ion-select>
      </ion-item>

      <ion-item>
        <ion-label>Page layout</ion-label>
        <ion-select
          [value]="pageLayout()"
          (ionChange)="onPageLayoutChange($event)"
          interface="popover"
          aria-label="Page layout"
        >
          @for (opt of pageLayouts; track opt.value) {
            <ion-select-option [value]="opt.value">{{ opt.label }}</ion-select-option>
          }
        </ion-select>
      </ion-item>

      <ion-item>
        <ion-label>Interface theme</ion-label>
        <ion-segment [value]="theme()" (ionChange)="onThemeChange($event)">
          @for (opt of themes; track opt.value) {
            <ion-segment-button [value]="opt.value">
              <ion-label>{{ opt.label }}</ion-label>
            </ion-segment-button>
          }
        </ion-segment>
      </ion-item>

      <ion-item>
        <ion-label>Viewer mode</ion-label>
        <ion-segment [value]="viewerMode()" (ionChange)="onViewerModeChange($event)">
          @for (opt of viewerModes; track opt.value) {
            <ion-segment-button [value]="opt.value">
              <ion-label>{{ opt.label }}</ion-label>
            </ion-segment-button>
          }
        </ion-segment>
      </ion-item>

      <ion-item>
        <ion-label>Page transition effect</ion-label>
        <ion-select
          [value]="pageTransition()"
          (ionChange)="onPageTransitionChange($event)"
          interface="popover"
          aria-label="Page transition"
        >
          @for (opt of pageTransitions; track opt.value) {
            <ion-select-option [value]="opt.value">{{ opt.label }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
    </ion-list>
  `,
  styles: [
    `
      .settings-list {
        padding-top: 8px;
      }
      ion-item ion-segment {
        max-width: 240px;
      }
    `,
  ],
})
export class DisplaySettingsComponent {
  private readonly settings = inject(SettingsService);

  public readonly pageLayouts = PAGE_LAYOUT_OPTIONS;
  public readonly themes = THEME_OPTIONS;
  public readonly viewerModes = VIEWER_MODE_OPTIONS;
  public readonly pageTransitions = PAGE_TRANSITION_OPTIONS;
  public readonly orientations = ORIENTATION_OPTIONS;

  // Bindings — read from the settings signal each cycle.
  public readonly orientation = computed(() => this.settings.settings().display.screenOrientation);
  public readonly pageLayout = computed(() => this.settings.settings().display.pageLayout);
  public readonly theme = computed(() => this.settings.settings().display.interfaceTheme);
  public readonly viewerMode = computed(() => this.settings.settings().display.viewerMode);
  public readonly pageTransition = computed(() => this.settings.settings().display.pageTransition);
  public readonly isRtl = computed(() => this.settings.settings().display.readingDirection === 'rtl');

  public onReadingDirectionChange(event: CustomEvent<{ checked: boolean }>): void {
    this.settings.setReadingDirection(event.detail.checked ? 'rtl' : 'ltr');
  }

  public onOrientationChange(event: CustomEvent<{ value: ScreenOrientation | undefined }>): void {
    if (event.detail.value !== undefined) this.settings.setScreenOrientation(event.detail.value);
  }

  public onPageLayoutChange(event: CustomEvent<{ value: PageLayout | undefined }>): void {
    if (event.detail.value !== undefined) this.settings.setPageLayout(event.detail.value);
  }

  public onThemeChange(event: CustomEvent<SegmentChangeEventDetail>): void {
    const v = event.detail.value;
    if (v === 'auto' || v === 'light' || v === 'dark') this.settings.setInterfaceTheme(v);
  }

  public onViewerModeChange(event: CustomEvent<SegmentChangeEventDetail>): void {
    const v = event.detail.value;
    if (v === 'paged' || v === 'vertical-scroll' || v === 'horizontal-scroll') {
      this.settings.setViewerMode(v);
    }
  }

  public onPageTransitionChange(event: CustomEvent<{ value: PageTransition | undefined }>): void {
    if (event.detail.value !== undefined) this.settings.setPageTransition(event.detail.value);
  }
}