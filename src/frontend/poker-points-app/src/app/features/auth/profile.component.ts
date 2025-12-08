import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { SessionInfo } from '../../core/models/session.models';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.authService.user;
  readonly displayName = signal('');
  readonly isEditing = signal(false);
  readonly isSaving = signal(false);
  readonly mySessions = signal<SessionInfo[]>([]);
  readonly isLoadingSessions = signal(false);

  readonly initials = computed(() => {
    const name = this.user()?.displayName || '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  });

  ngOnInit(): void {
    this.displayName.set(this.user()?.displayName || '');
    this.loadSessions();
  }

  async loadSessions(): Promise<void> {
    this.isLoadingSessions.set(true);
    try {
      const sessions = await this.authService.getMySessions();
      this.mySessions.set(sessions);
    } catch {
      // Ignore errors
    } finally {
      this.isLoadingSessions.set(false);
    }
  }

  startEditing(): void {
    this.displayName.set(this.user()?.displayName || '');
    this.isEditing.set(true);
  }

  cancelEditing(): void {
    this.isEditing.set(false);
  }

  async saveProfile(): Promise<void> {
    if (!this.displayName().trim()) return;

    this.isSaving.set(true);
    try {
      await this.authService.updateProfile({ displayName: this.displayName().trim() });
      this.isEditing.set(false);
    } catch {
      // Handle error
    } finally {
      this.isSaving.set(false);
    }
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/']);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
