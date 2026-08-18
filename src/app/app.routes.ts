import type { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'viewer',
    pathMatch: 'full',
  },
  {
    path: 'viewer',
    loadComponent: () =>
      import('./features/viewer/viewer.page').then((m) => m.ViewerPage),
  },
  {
    path: 'bookshelf',
    loadComponent: () =>
      import('./features/bookshelf/bookshelf.page').then((m) => m.BookshelfPage),
  },
  {
    path: 'file-browser',
    loadComponent: () =>
      import('./features/file-browser/file-browser.page').then(
        (m) => m.FileBrowserPage,
      ),
  },
  {
    path: 'preferences',
    loadComponent: () =>
      import('./features/preferences/preferences.page').then(
        (m) => m.PreferencesPage,
      ),
  },
  {
    path: 'about',
    loadComponent: () =>
      import('./features/about/about.page').then((m) => m.AboutPage),
  },
];