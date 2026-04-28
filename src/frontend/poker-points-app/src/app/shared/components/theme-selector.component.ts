import { Component, inject } from '@angular/core';
import { ThemePreference, ThemeService } from '../../core/services/theme.service';

type ThemeOption = {
  value: ThemePreference;
  label: string;
  title: string;
  iconPath: string;
};

@Component({
  selector: 'app-theme-selector',
  standalone: true,
  template: `
    <div class="theme-selector" role="group" aria-label="Theme">
      @for (option of options; track option.value) {
        <button
          type="button"
          class="theme-selector__button"
          [class.theme-selector__button--active]="preference() === option.value"
          [attr.aria-label]="option.title"
          [attr.aria-pressed]="preference() === option.value"
          [title]="option.title"
          (click)="setTheme(option.value)"
        >
          <svg
            class="theme-selector__icon"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="option.iconPath" />
          </svg>
          <span class="theme-selector__label">{{ option.label }}</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .theme-selector {
        display: inline-flex;
        align-items: center;
        gap: 0.125rem;
        padding: 0.1875rem;
        border: 1px solid rgb(229 231 235);
        border-radius: 0.75rem;
        background: rgb(249 250 251);
      }

      .theme-selector__button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.375rem;
        min-width: 2rem;
        height: 2rem;
        padding: 0 0.5rem;
        border: 0;
        border-radius: 0.5625rem;
        color: rgb(107 114 128);
        background: transparent;
        font-size: 0.75rem;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        transition:
          background-color 150ms ease,
          color 150ms ease,
          box-shadow 150ms ease;
      }

      .theme-selector__button:hover {
        color: rgb(63 118 2);
        background: rgb(230 242 212);
      }

      .theme-selector__button--active {
        color: rgb(52 95 5);
        background: white;
        box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
      }

      .theme-selector__icon {
        width: 1rem;
        height: 1rem;
        flex: 0 0 auto;
      }

      @media (max-width: 640px) {
        .theme-selector__label {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      }

      :host-context(.dark) .theme-selector {
        border-color: rgb(55 65 81);
        background: rgb(17 24 39);
      }

      :host-context(.dark) .theme-selector__button {
        color: rgb(156 163 175);
      }

      :host-context(.dark) .theme-selector__button:hover {
        color: rgb(205 229 173);
        background: rgb(42 76 4 / 0.55);
      }

      :host-context(.dark) .theme-selector__button--active {
        color: rgb(244 249 236);
        background: rgb(31 41 55);
        box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
      }
    `,
  ],
})
export class ThemeSelectorComponent {
  private readonly themeService = inject(ThemeService);

  readonly preference = this.themeService.preference;

  readonly options: ThemeOption[] = [
    {
      value: 'light',
      label: 'Light',
      title: 'Use light theme',
      iconPath:
        'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364-.707-.707M6.343 6.343l-.707-.707m12.728 0-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
    },
    {
      value: 'dark',
      label: 'Dark',
      title: 'Use dark theme',
      iconPath:
        'M21.752 15.002A9.718 9.718 0 0118 15.75 9.75 9.75 0 018.25 6c0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25 9.75 9.75 0 0012.75 21a9.753 9.753 0 009.002-5.998z',
    },
    {
      value: 'system',
      label: 'System',
      title: 'Use system theme',
      iconPath:
        'M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25M5.25 4.5h13.5A2.25 2.25 0 0121 6.75v7.5a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 14.25v-7.5A2.25 2.25 0 015.25 4.5z',
    },
  ];

  setTheme(preference: ThemePreference): void {
    this.themeService.setPreference(preference);
  }
}
