import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'poker-points-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly mediaQuery =
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  readonly preference = signal<ThemePreference>(this.getStoredPreference());
  private readonly systemTheme = signal<ResolvedTheme>(this.getSystemTheme());
  readonly resolvedTheme = computed<ResolvedTheme>(() => {
    const preference = this.preference();
    return preference === 'system' ? this.systemTheme() : preference;
  });

  constructor() {
    this.mediaQuery?.addEventListener('change', (event) => {
      this.systemTheme.set(event.matches ? 'dark' : 'light');
    });

    effect(() => {
      this.applyTheme(this.resolvedTheme(), this.preference());
    });
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);

    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(THEME_STORAGE_KEY, preference);
  }

  private getStoredPreference(): ThemePreference {
    if (typeof localStorage === 'undefined') {
      return 'system';
    }

    const storedPreference = localStorage.getItem(THEME_STORAGE_KEY);
    return this.isThemePreference(storedPreference) ? storedPreference : 'system';
  }

  private getSystemTheme(): ResolvedTheme {
    return this.mediaQuery?.matches ? 'dark' : 'light';
  }

  private applyTheme(resolvedTheme: ResolvedTheme, preference: ThemePreference): void {
    const root = this.document.documentElement;

    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset['theme'] = preference;
    root.style.colorScheme = resolvedTheme;
  }

  private isThemePreference(value: string | null): value is ThemePreference {
    return value === 'light' || value === 'dark' || value === 'system';
  }
}
