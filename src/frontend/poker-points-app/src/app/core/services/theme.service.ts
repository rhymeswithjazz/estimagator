import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { getSeason, isSeason, Season, SEASONS } from '../models/season.models';

export type ThemePreference = 'light' | 'dark' | 'system' | Season;
export type ResolvedTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'poker-points-theme';

export const CURRENT_DATE = new InjectionToken<() => Date>('CURRENT_DATE', {
  providedIn: 'root',
  factory: () => () => new Date(),
});

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly mediaQuery =
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  private readonly currentSeason = getSeason(inject(CURRENT_DATE)());
  private readonly inGame = signal(false);
  readonly availableSeason = computed(() => (this.inGame() ? this.currentSeason : null));
  readonly preference = signal<ThemePreference>(this.getStoredPreference());
  readonly effectivePreference = computed<ThemePreference>(() => {
    const preference = this.preference();
    if (!isSeason(preference) || preference === this.availableSeason()) {
      return preference;
    }

    return preference === this.currentSeason ? 'dark' : 'system';
  });
  readonly activeSeason = computed<Season | null>(() => {
    const preference = this.effectivePreference();
    return isSeason(preference) ? preference : null;
  });
  private readonly systemTheme = signal<ResolvedTheme>(this.getSystemTheme());
  readonly resolvedTheme = computed<ResolvedTheme>(() => {
    const preference = this.effectivePreference();
    if (preference === 'system') {
      return this.systemTheme();
    }

    return isSeason(preference) ? 'dark' : preference;
  });

  constructor() {
    this.mediaQuery?.addEventListener('change', (event) => {
      this.systemTheme.set(event.matches ? 'dark' : 'light');
    });

    effect(() => {
      this.applyTheme(this.resolvedTheme(), this.effectivePreference(), this.activeSeason());
    });
  }

  setInGame(inGame: boolean): void {
    this.inGame.set(inGame);
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
    return storedPreference !== null && this.isThemePreference(storedPreference)
      ? storedPreference
      : 'system';
  }

  private getSystemTheme(): ResolvedTheme {
    return this.mediaQuery?.matches ? 'dark' : 'light';
  }

  private applyTheme(
    resolvedTheme: ResolvedTheme,
    preference: ThemePreference,
    activeSeason: Season | null,
  ): void {
    const root = this.document.documentElement;

    root.classList.toggle('dark', resolvedTheme === 'dark');
    for (const season of SEASONS) {
      root.classList.toggle(season, season === activeSeason);
    }
    root.dataset['theme'] = preference;
    root.style.colorScheme = resolvedTheme;
  }

  private isThemePreference(value: string): value is ThemePreference {
    return value === 'light' || value === 'dark' || value === 'system' || isSeason(value);
  }
}
