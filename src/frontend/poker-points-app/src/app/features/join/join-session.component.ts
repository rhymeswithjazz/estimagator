import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/services/session.service';
import { GameStateService } from '../../core/services/game-state.service';
import { DOCUMENT } from '@angular/common';

@Component({
  selector: 'app-join-session',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './join-session.component.html',
})
export class JoinSessionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionService = inject(SessionService);
  private readonly gameState = inject(GameStateService);
  private readonly document = inject(DOCUMENT);

  readonly sessionCode = signal('');
  readonly displayName = signal('');
  readonly isObserver = signal(false);
  readonly selectedRole = signal<'host-voter' | 'host-observer'>('host-voter');
  readonly isJoining = signal(false);
  readonly isNewSession = signal(false);
  readonly error = signal<string | null>(null);
  readonly isLoading = signal(true);
  readonly sessionNotFound = signal(false);
  readonly sessionInactive = signal(false);
  readonly inactiveSessionName = signal<string | null>(null);
  readonly returningUser = signal<{ displayName: string; isObserver: boolean } | null>(null);
  readonly urlCopied = signal(false);

  readonly joinUrl = computed(() => {
    const code = this.sessionCode();
    if (!code) return '';
    const baseUrl = this.document.location.origin;
    return `${baseUrl}/join/${code}`;
  });

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code');
    const isNew = this.route.snapshot.queryParamMap.get('new') === 'true';

    if (!code) {
      this.router.navigate(['/']);
      return;
    }

    this.sessionCode.set(code.toUpperCase());
    this.isNewSession.set(isNew);

    // Check if user has previously joined this session
    const storedIdentity = this.gameState.getStoredIdentityForSession(code);
    if (storedIdentity) {
      this.returningUser.set({
        displayName: storedIdentity.displayName,
        isObserver: storedIdentity.isObserver,
      });
    }

    this.validateSession(code);
  }

  private async validateSession(code: string): Promise<void> {
    try {
      const session = await this.sessionService.getSession(code);
      if (session === null) {
        this.sessionNotFound.set(true);
      } else if (!session.isActive) {
        this.sessionInactive.set(true);
        this.inactiveSessionName.set(session.name);
      }
    } catch {
      this.sessionNotFound.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  async joinGame(): Promise<void> {
    const name = this.displayName().trim();
    if (!name) {
      this.error.set('Please enter your name');
      return;
    }

    if (name.length < 2) {
      this.error.set('Name must be at least 2 characters');
      return;
    }

    this.isJoining.set(true);
    this.error.set(null);

    try {
      // For new sessions, use selected role; for existing sessions, use toggle
      const isObserver = this.isNewSession()
        ? this.selectedRole() === 'host-observer'
        : this.isObserver();

      const joined = await this.gameState.joinSession(
        this.sessionCode(),
        name,
        isObserver
      );

      if (joined) {
        this.router.navigate(['/game', this.sessionCode()]);
      } else {
        this.error.set('Failed to join the game. Please try again.');
      }
    } catch (err) {
      this.error.set('Connection error. Please check your network and try again.');
    } finally {
      this.isJoining.set(false);
    }
  }

  onNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.displayName.set(input.value);
    this.error.set(null);
  }

  toggleObserver(): void {
    this.isObserver.update((v) => !v);
  }

  selectRole(role: 'host-voter' | 'host-observer'): void {
    this.selectedRole.set(role);
  }

  async rejoinGame(): Promise<void> {
    const returning = this.returningUser();
    if (!returning) return;

    this.isJoining.set(true);
    this.error.set(null);

    try {
      const joined = await this.gameState.joinSession(
        this.sessionCode(),
        returning.displayName,
        returning.isObserver
      );

      if (joined) {
        this.router.navigate(['/game', this.sessionCode()]);
      } else {
        this.error.set('Failed to rejoin. Please try joining as a new user.');
        this.returningUser.set(null);
      }
    } catch (err) {
      this.error.set('Connection error. Please check your network and try again.');
    } finally {
      this.isJoining.set(false);
    }
  }

  joinAsNewUser(): void {
    this.returningUser.set(null);
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  async copyJoinUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.joinUrl());
      this.urlCopied.set(true);
      setTimeout(() => this.urlCopied.set(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = this.document.createElement('textarea');
      textArea.value = this.joinUrl();
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      this.document.body.appendChild(textArea);
      textArea.select();
      this.document.execCommand('copy');
      this.document.body.removeChild(textArea);
      this.urlCopied.set(true);
      setTimeout(() => this.urlCopied.set(false), 2000);
    }
  }
}
