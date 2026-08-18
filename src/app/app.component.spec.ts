import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('exposes the menu groups', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.library.map((i) => i.url)).toEqual([
      '/viewer',
      '/bookshelf',
      '/file-browser',
    ]);
    expect(app.settings.map((i) => i.url)).toEqual([
      '/preferences',
      '/about',
    ]);
  });
});