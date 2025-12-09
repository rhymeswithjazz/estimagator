import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <div class="text-center mb-6">
          <h1 class="text-2xl font-bold text-emerald-600">Estimagator</h1>
          <p class="text-gray-500 text-sm">Bite-sized estimation for agile teams</p>
        </div>

        @if (!submitted()) {
          <div>
            <h2 class="text-xl font-semibold text-center mb-2">Reset Password</h2>
            <p class="text-gray-600 text-center text-sm mb-6">
              Enter your email address and we'll send you a link to reset your password.
            </p>

            <form (ngSubmit)="onSubmit()" class="space-y-4">
              <div>
                <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  [(ngModel)]="email"
                  name="email"
                  required
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="you@example.com"
                />
              </div>

              @if (error()) {
                <div class="p-3 bg-red-50 text-red-700 rounded-md text-sm">
                  {{ error() }}
                </div>
              }

              <button
                type="submit"
                [disabled]="isLoading() || !email()"
                class="w-full bg-emerald-600 text-white py-2 px-4 rounded-md hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {{ isLoading() ? 'Sending...' : 'Send Reset Link' }}
              </button>
            </form>

            <p class="mt-6 text-center text-sm text-gray-600">
              Remember your password?
              <a routerLink="/login" class="text-emerald-600 hover:text-emerald-700 font-medium">
                Sign in
              </a>
            </p>
          </div>
        } @else {
          <div class="text-center py-4">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 mb-4">
              <svg class="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Check Your Email</h2>
            <p class="text-gray-600 mb-6">
              If an account exists with that email, we've sent password reset instructions.
            </p>
            <a
              routerLink="/login"
              class="inline-block bg-emerald-600 text-white px-6 py-2 rounded-md hover:bg-emerald-700 transition-colors"
            >
              Back to Login
            </a>
          </div>
        }
      </div>
    </div>
  `,
})
export class ForgotPasswordComponent {
  private readonly authService = inject(AuthService);

  email = signal('');
  isLoading = signal(false);
  error = signal<string | null>(null);
  submitted = signal(false);

  async onSubmit(): Promise<void> {
    if (!this.email()) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      await this.authService.forgotPassword(this.email());
      this.submitted.set(true);
    } catch {
      // Always show success to prevent email enumeration
      this.submitted.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }
}
