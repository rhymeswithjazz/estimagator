import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/services/session.service';
import { AuthService } from '../../core/services/auth.service';
import { DeckType, DECK_VALUES } from '../../core/models/session.models';
import { GameStateService } from '../../core/services/game-state.service';
import { AccountDropdownComponent } from '../game/account-dropdown.component';
import { ThemeSelectorComponent } from '../../shared/components/theme-selector.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, RouterLink, AccountDropdownComponent, ThemeSelectorComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  private readonly sessionService = inject(SessionService);
  private readonly authService = inject(AuthService);
  private readonly gameState = inject(GameStateService);
  private readonly router = inject(Router);

  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly user = this.authService.user;
  readonly shouldCollectHostName = computed(() => this.user()?.emailVerified !== true);

  readonly joinCode = signal('');
  readonly selectedDeck = signal<DeckType>('fibonacci');
  readonly isCreating = signal(false);
  readonly isJoining = signal(false);
  readonly joinError = signal<string | null>(null);
  readonly showCreateOptions = signal(false);
  readonly sessionName = signal('');
  readonly hostName = signal('');
  readonly selectedCreateRole = signal<'host-voter' | 'host-observer'>('host-voter');
  readonly createError = signal<string | null>(null);

  readonly selectedTimerDuration = signal(300);
  readonly customTimerMinutes = signal('');
  readonly isCustomTimer = signal(false);

  readonly timerOptions = [
    { value: 120, label: '2 min' },
    { value: 300, label: '5 min' },
    { value: 420, label: '7 min' },
    { value: 600, label: '10 min' },
  ];

  readonly deckOptions: { value: DeckType; label: string; preview: string }[] = [
    {
      value: 'fibonacci',
      label: 'Fibonacci',
      preview: DECK_VALUES.fibonacci.slice(0, 5).join(', ') + '...',
    },
    {
      value: 'modified',
      label: 'Modified Fibonacci',
      preview: DECK_VALUES.modified.slice(0, 6).join(', ') + '...',
    },
    {
      value: 'powers',
      label: 'Powers of 2',
      preview: DECK_VALUES.powers.slice(0, 5).join(', ') + '...',
    },
    {
      value: 'linear',
      label: 'Linear (1-10)',
      preview: DECK_VALUES.linear.slice(0, 5).join(', ') + '...',
    },
  ];

  async createSession(): Promise<void> {
    const displayName = this.getCreateDisplayName();
    if (this.shouldCollectHostName()) {
      if (!displayName) {
        this.createError.set('Please enter your name');
        return;
      }

      if (displayName.length < 2) {
        this.createError.set('Name must be at least 2 characters');
        return;
      }
    }

    this.isCreating.set(true);
    this.createError.set(null);
    try {
      const name = this.sessionName().trim() || undefined;
      const response = await this.sessionService.createSession(
        this.selectedDeck(),
        name,
        this.selectedTimerDuration(),
      );

      if (response.guestHostToken) {
        this.gameState.storeGuestHostToken(response.accessCode, response.guestHostToken);
      }

      const joined = await this.gameState.joinSession(
        response.accessCode,
        displayName || 'Host',
        this.selectedCreateRole() === 'host-observer',
        response.guestHostToken ?? undefined,
      );

      if (joined) {
        this.router.navigate(['/game', response.accessCode]);
      } else {
        this.createError.set('Game created, but failed to join. Use the game code to join.');
      }
    } catch (err) {
      console.error('Failed to create session:', err);
      this.createError.set('Failed to create game. Please try again.');
    } finally {
      this.isCreating.set(false);
    }
  }

  async joinSession(): Promise<void> {
    const code = this.joinCode().trim().toUpperCase();
    if (!code) {
      this.joinError.set('Please enter a game code');
      return;
    }

    this.isJoining.set(true);
    this.joinError.set(null);

    try {
      const exists = await this.sessionService.sessionExists(code);
      if (!exists) {
        this.joinError.set('Game not found. Check the code and try again.');
        return;
      }
      this.router.navigate(['/join', code]);
    } catch (err) {
      this.joinError.set('Failed to find game. Please try again.');
    } finally {
      this.isJoining.set(false);
    }
  }

  onJoinCodeInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.joinCode.set(input.value.toUpperCase());
    this.joinError.set(null);
  }

  toggleCreateOptions(): void {
    this.showCreateOptions.update((v) => !v);
  }

  onSessionNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.sessionName.set(input.value);
  }

  onHostNameInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.hostName.set(input.value);
    this.createError.set(null);
  }

  selectDeck(deck: DeckType): void {
    this.selectedDeck.set(deck);
  }

  selectCreateRole(role: 'host-voter' | 'host-observer'): void {
    this.selectedCreateRole.set(role);
  }

  selectTimerDuration(duration: number): void {
    this.selectedTimerDuration.set(duration);
    this.isCustomTimer.set(false);
    this.customTimerMinutes.set('');
  }

  applyCustomTimer(): void {
    const mins = parseInt(this.customTimerMinutes(), 10);
    if (mins > 0) {
      this.selectedTimerDuration.set(mins * 60);
      this.isCustomTimer.set(true);
    }
  }

  private getCreateDisplayName(): string {
    return this.shouldCollectHostName()
      ? this.hostName().trim()
      : this.user()?.displayName?.trim() || 'Host';
  }
}
