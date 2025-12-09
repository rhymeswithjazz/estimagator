import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
        <div class="text-center mb-6">
          <h1 class="text-2xl font-bold text-emerald-600">Estimagator</h1>
          <p class="text-gray-500 text-sm">Bite-sized estimation for agile teams</p>
        </div>

        @if (isLoading()) {
          <div class="text-center py-8">
            <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-600 border-t-transparent"></div>
            <p class="mt-4 text-gray-600">Verifying your email...</p>
          </div>
        }

        @if (success()) {
          <div class="text-center py-8">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-emerald-100 mb-4">
              <svg class="h-6 w-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Email Verified!</h2>
            <p class="text-gray-600 mb-6">Your email has been successfully verified. You can now access all features.</p>
            <a
              routerLink="/"
              class="inline-block bg-emerald-600 text-white px-6 py-2 rounded-md hover:bg-emerald-700 transition-colors"
            >
              Go to Home
            </a>
          </div>
        }

        @if (error()) {
          <div class="text-center py-8">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-900 mb-2">Verification Failed</h2>
            <p class="text-gray-600 mb-6">{{ error() }}</p>
            <div class="space-y-3">
              <a
                routerLink="/login"
                class="block bg-emerald-600 text-white px-6 py-2 rounded-md hover:bg-emerald-700 transition-colors"
              >
                Go to Login
              </a>
              @if (canResend()) {
                <button
                  (click)="resendVerification()"
                  [disabled]="isResending()"
                  class="block w-full text-emerald-600 hover:text-emerald-700 text-sm"
                >
                  {{ isResending() ? 'Sending...' : 'Resend verification email' }}
                </button>
              }
            </div>
          </div>
        }

        @if (resendSuccess()) {
          <div class="mt-4 p-3 bg-emerald-50 text-emerald-700 rounded-md text-sm text-center">
            Verification email sent! Please check your inbox.
          </div>
        }
      </div>
    </div>
  `,
})
export class VerifyEmailComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  isLoading = signal(true);
  success = signal(false);
  error = signal<string | null>(null);
  canResend = signal(false);
  isResending = signal(false);
  resendSuccess = signal(false);

  private userEmail: string | null = null;

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');

    if (!token) {
      this.isLoading.set(false);
      this.error.set('No verification token provided');
      return;
    }

    this.verifyEmail(token);
  }

  private async verifyEmail(token: string): Promise<void> {
    try {
      await this.authService.verifyEmail(token);
      this.isLoading.set(false);
      this.success.set(true);
    } catch (err) {
      this.isLoading.set(false);
      this.error.set('Invalid or expired verification link. Please request a new one.');
      this.canResend.set(true);

      // Get email from auth state if available
      const user = this.authService.user();
      if (user) {
        this.userEmail = user.email;
      }
    }
  }

  async resendVerification(): Promise<void> {
    const email = this.userEmail || this.authService.user()?.email;

    if (!email) {
      this.router.navigate(['/login']);
      return;
    }

    this.isResending.set(true);
    this.resendSuccess.set(false);

    try {
      await this.authService.resendVerification(email);
      this.resendSuccess.set(true);
    } catch {
      // Always show success to prevent email enumeration
      this.resendSuccess.set(true);
    } finally {
      this.isResending.set(false);
    }
  }
}
