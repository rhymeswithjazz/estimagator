import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, InjectionToken, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system' | 'halloween';
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'poker-points-theme';
const OCTOBER = 9;

export const CURRENT_DATE = new InjectionToken<() => Date>('CURRENT_DATE', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly mediaQuery =
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  readonly halloweenAvailable = inject(CURRENT_DATE)().getMonth() === OCTOBER;
  readonly preference = signal<ThemePreference>(this.getStoredPreference());
  readonly effectivePreference = computed<ThemePreference>(() => {
    const preference = this.preference();
    return preference === 'halloween' && !this.halloweenAvailable ? 'system' : preference;
  });
  readonly isHalloween = computed(() => this.effectivePreference() === 'halloween');
  private readonly systemTheme = signal<ResolvedTheme>(this.getSystemTheme());
  readonly resolvedTheme = computed<ResolvedTheme>(() => {
    const preference = this.effectivePreference();
    if (preference === 'system') {
      return this.systemTheme();
    }

    return preference === 'halloween' ? 'dark' : preference;
  });

  constructor() {
    this.mediaQuery?.addEventListener('change', (event) => {
      this.systemTheme.set(event.matches ? 'dark' : 'light');
    });

    effect(() => {
      this.applyTheme(this.resolvedTheme(), this.effectivePreference(), this.isHalloween());
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

  private applyTheme(
    resolvedTheme: ResolvedTheme,
    preference: ThemePreference,
    isHalloween: boolean,
  ): void {
    const root = this.document.documentElement;

    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.classList.toggle('halloween', isHalloween);
    root.dataset['theme'] = preference;
    root.style.colorScheme = resolvedTheme;
  }

  private isThemePreference(value: string | null): value is ThemePreference {
    return value === 'light' || value === 'dark' || value === 'system' || value === 'halloween';
  }
}
