import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <div class="text-center mb-6">
          <h1 class="text-2xl font-bold text-emerald-600">Estimagator</h1>
          <p class="text-gray-500 text-sm">Bite-sized estimation for agile teams</p>
        </div>

        @if (!token) {
          <div class="text-center py-8">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Invalid Link</h2>
            <p class="text-gray-600 mb-6">This password reset link is invalid.</p>
            <a
              routerLink="/forgot-password"
              class="inline-block bg-emerald-600 text-white px-6 py-2 rounded-md hover:bg-emerald-700 transition-colors"
            >
              Request New Link
            </a>
          </div>
        } @else if (!success()) {
          <div>
            <h2 class="text-xl font-semibold text-center mb-2">Set New Password</h2>
            <p class="text-gray-600 text-center text-sm mb-6">
              Enter your new password below.
            </p>

            <form (ngSubmit)="onSubmit()" class="space-y-4">
              <div>
                <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  id="password"
                  type="password"
                  [(ngModel)]="password"
                  name="password"
                  required
                  minlength="6"
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="At least 6 characters"
                />
              </div>

              <div>
                <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  [(ngModel)]="confirmPassword"
                  name="confirmPassword"
                  required
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Confirm your password"
                />
              </div>

              @if (error()) {
                <div class="p-3 bg-red-50 text-red-700 rounded-md text-sm">
                  {{ error() }}
                </div>
              }

              <button
                type="submit"
                [disabled]="isLoading() || !isValid()"
                class="w-full bg-emerald-600 text-white py-2 px-4 rounded-md hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {{ isLoading() ? 'Resetting...' : 'Reset Password' }}
              </button>
            </form>
          </div>
        } @else {
          <div class="text-center py-4">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 mb-4">
              <svg class="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Password Reset!</h2>
            <p class="text-gray-600 mb-6">
              Your password has been successfully reset. You can now sign in with your new password.
            </p>
            <a
              routerLink="/login"
              class="inline-block bg-emerald-600 text-white px-6 py-2 rounded-md hover:bg-emerald-700 transition-colors"
            >
              Sign In
            </a>
          </div>
        }
      </div>
    </div>
  `,
})
export class ResetPasswordComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  token: string | null = null;
  password = signal('');
  confirmPassword = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);
  success = signal(false);

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token');
  }

  isValid(): boolean {
    return (
      this.password().length >= 6 &&
      this.password() === this.confirmPassword()
    );
  }

  async onSubmit(): Promise<void> {
    if (!this.token || !this.isValid()) return;

    if (this.password() !== this.confirmPassword()) {
      this.error.set('Passwords do not match');
      return;
    }

    if (this.password().length < 6) {
      this.error.set('Password must be at least 6 characters');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    try {
      await this.authService.resetPassword(this.token, this.password());
      this.success.set(true);
    } catch {
      this.error.set('Invalid or expired reset link. Please request a new one.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
