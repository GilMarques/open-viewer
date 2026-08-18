import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonButton,
  IonContent,
  IonFooter,
  IonIcon,
  IonItem,
  IonList,
  IonLabel,
  IonMenu,
  IonMenuToggle,
  IonRouterOutlet,
  IonSplitPane,
} from '@ionic/angular/standalone';

import { SettingsService } from './core/services/settings.service';

type MenuItem = { title: string; url: string; icon: string };

@Component({
  selector: 'app-root',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    IonApp,
    IonSplitPane,
    IonMenu,
    IonContent,
    IonList,
    IonMenuToggle,
    IonItem,
    IonIcon,
    IonLabel,
    IonRouterOutlet,
    IonFooter,
    IonButton,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  private readonly settings = inject(SettingsService);

  public readonly library: readonly MenuItem[] = [
    { title: 'Viewer', url: '/viewer', icon: 'book' },
    { title: 'Bookshelf', url: '/bookshelf', icon: 'library' },
    { title: 'File Browser', url: '/file-browser', icon: 'folder' },
  ];

  public readonly settingsMenu: readonly MenuItem[] = [
    { title: 'Preferences', url: '/preferences', icon: 'settings' },
    { title: 'About', url: '/about', icon: 'information-circle' },
  ];

  constructor() {
    // Apply theme at the document level so every page inherits it.
    effect(() => {
      applyTheme(this.settings.settings().display.interfaceTheme);
    });
  }
}

/**
 * Apply a theme via two classes on <html>:
 *  - ov-theme-light / ov-theme-dark → our own hook for app-wide overrides
 *  - ion-palette-dark               → Ionic's dark-mode palette trigger
 *
 * 'auto' falls through to Ionic's prefers-color-scheme media query.
 */
function applyTheme(theme: 'auto' | 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('ov-theme-light', 'ov-theme-dark', 'ion-palette-dark');
  if (theme === 'light') root.classList.add('ov-theme-light');
  else if (theme === 'dark') {
    root.classList.add('ov-theme-dark', 'ion-palette-dark');
  }
}