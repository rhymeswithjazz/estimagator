import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.component.html',
})
export class RegisterComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly displayName = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly confirmPassword = signal('');
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal(false);

  async register(): Promise<void> {
    if (!this.displayName() || !this.email() || !this.password()) {
      this.error.set('Please fill in all fields');
      return;
    }

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
      await this.authService.register({
        displayName: this.displayName(),
        email: this.email(),
        password: this.password(),
      });

      this.success.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      this.isLoading.set(false);
    }
  }
}
