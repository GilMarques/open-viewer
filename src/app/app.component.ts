import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenu,
  IonMenuToggle,
  IonRouterOutlet,
  IonSplitPane,
} from '@ionic/angular/standalone';

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
    IonListHeader,
    IonMenuToggle,
    IonItem,
    IonIcon,
    IonLabel,
    IonRouterOutlet,
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  public readonly library: readonly MenuItem[] = [
    { title: 'Viewer', url: '/viewer', icon: 'book' },
    { title: 'Bookshelf', url: '/bookshelf', icon: 'library' },
    { title: 'File Browser', url: '/file-browser', icon: 'folder' },
  ];

  public readonly settings: readonly MenuItem[] = [
    { title: 'Preferences', url: '/preferences', icon: 'settings' },
    { title: 'About', url: '/about', icon: 'information-circle' },
  ];
}