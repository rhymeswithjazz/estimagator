import { Component, inject, signal } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly email = signal('');
  readonly password = signal('');
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  async login(): Promise<void> {
    if (!this.email() || !this.password()) {
      this.error.set('Please enter email and password');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    try {
      await this.authService.login({
        email: this.email(),
        password: this.password(),
      });

      const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
      this.router.navigateByUrl(returnUrl);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Login failed');
    } finally {
      this.isLoading.set(false);
    }
  }
}
