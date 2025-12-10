import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { SessionService } from '../../core/services/session.service';
import { UserSession } from '../../core/models/session.models';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly sessionService = inject(SessionService);
  private readonly router = inject(Router);

  readonly user = this.authService.user;
  readonly displayName = signal('');
  readonly isEditing = signal(false);
  readonly isSaving = signal(false);
  readonly allSessions = signal<UserSession[]>([]);
  readonly isLoadingSessions = signal(false);
  readonly endingSessionCode = signal<string | null>(null);

  readonly createdSessions = computed(() =>
    this.allSessions().filter((s) => s.isOrganizer)
  );

  readonly joinedSessions = computed(() =>
    this.allSessions().filter((s) => !s.isOrganizer)
  );

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
      this.allSessions.set(sessions);
    } catch {
      // Ignore errors
    } finally {
      this.isLoadingSessions.set(false);
    }
  }

  async endSession(event: Event, accessCode: string): Promise<void> {
    event.preventDefault();
    event.stopPropagation();

    if (this.endingSessionCode()) return;

    this.endingSessionCode.set(accessCode);
    try {
      const success = await this.sessionService.deactivateSession(accessCode);
      if (success) {
        // Update the session in the list
        this.allSessions.update((sessions) =>
          sessions.map((s) =>
            s.accessCode === accessCode ? { ...s, isActive: false } : s
          )
        );
      }
    } finally {
      this.endingSessionCode.set(null);
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
