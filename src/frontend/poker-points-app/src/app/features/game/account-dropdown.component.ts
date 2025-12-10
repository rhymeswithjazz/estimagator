import { Component, inject, output, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-account-dropdown',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="relative">
      <!-- Trigger Button (Profile Avatar) -->
      <button
        (click)="toggleDropdown()"
        class="flex items-center gap-2 p-1 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-poker-green-400 to-poker-green-600 flex items-center justify-center text-white font-bold text-sm">
          {{ userInitials() }}
        </div>
        <div class="text-left hidden sm:block">
          <div class="text-gray-900 font-medium text-sm">{{ user()?.displayName }}</div>
        </div>
        <svg
          class="w-4 h-4 text-gray-400 transition-transform"
          [class.rotate-180]="isOpen()"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <!-- Dropdown Menu -->
      @if (isOpen()) {
        <div
          class="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
        >
          <!-- User Info -->
          <div class="px-4 py-2 border-b border-gray-100">
            <div class="font-medium text-gray-900">{{ user()?.displayName }}</div>
            <div class="text-sm text-gray-500 truncate">{{ user()?.email }}</div>
          </div>

          <!-- Menu Items -->
          <div class="py-1">
            <a
              routerLink="/profile"
              (click)="close()"
              class="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              View Profile
            </a>
            <button
              (click)="initiatePasswordReset()"
              class="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              <svg class="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Change Password
            </button>
          </div>

          <!-- Sign Out -->
          <div class="border-t border-gray-100 pt-1">
            <button
              (click)="signOut()"
              class="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>

          @if (passwordResetSent()) {
            <div class="mx-4 my-2 p-2 bg-poker-green-50 text-poker-green-700 text-xs rounded-lg flex items-start gap-2">
              <svg class="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Password reset email sent!</span>
            </div>
          }
        </div>
      }
    </div>

    <!-- Backdrop to close dropdown -->
    @if (isOpen()) {
      <div
        class="fixed inset-0 z-40"
        (click)="close()"
      ></div>
    }
  `,
  styles: [`
    :host {
      position: relative;
      z-index: 50;
    }
  `]
})
export class AccountDropdownComponent {
  private readonly authService = inject(AuthService);

  readonly user = this.authService.user;
  readonly isOpen = signal(false);
  readonly passwordResetSent = signal(false);

  readonly userInitials = computed(() => {
    const name = this.user()?.displayName || '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  });

  toggleDropdown(): void {
    this.isOpen.update(open => !open);
  }

  close(): void {
    this.isOpen.set(false);
  }

  async initiatePasswordReset(): Promise<void> {
    const email = this.user()?.email;
    if (!email) return;

    try {
      await this.authService.forgotPassword(email);
      this.passwordResetSent.set(true);
      // Auto-hide after a few seconds
      setTimeout(() => this.passwordResetSent.set(false), 5000);
    } catch {
      this.passwordResetSent.set(true);
      setTimeout(() => this.passwordResetSent.set(false), 5000);
    }
  }

  async signOut(): Promise<void> {
    this.close();
    await this.authService.logout();
  }
}
