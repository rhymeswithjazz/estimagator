import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/services/session.service';
import { AuthService } from '../../core/services/auth.service';
import { DeckType, DECK_VALUES } from '../../core/models/session.models';
import { AccountDropdownComponent } from '../game/account-dropdown.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FormsModule, RouterLink, AccountDropdownComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  private readonly sessionService = inject(SessionService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isAuthenticated = this.authService.isAuthenticated;
  readonly user = this.authService.user;

  readonly joinCode = signal('');
  readonly selectedDeck = signal<DeckType>('fibonacci');
  readonly isCreating = signal(false);
  readonly isJoining = signal(false);
  readonly joinError = signal<string | null>(null);
  readonly showCreateOptions = signal(false);
  readonly sessionName = signal('');
  readonly createError = signal<string | null>(null);

  readonly deckOptions: { value: DeckType; label: string; preview: string }[] = [
    { value: 'fibonacci', label: 'Fibonacci', preview: DECK_VALUES.fibonacci.slice(0, 5).join(', ') + '...' },
    { value: 'tshirt', label: 'T-Shirt Sizes', preview: DECK_VALUES.tshirt.slice(0, 5).join(', ') + '...' },
    { value: 'powers', label: 'Powers of 2', preview: DECK_VALUES.powers.slice(0, 5).join(', ') + '...' },
  ];

  async createSession(): Promise<void> {
    if (!this.isAuthenticated()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/' } });
      return;
    }

    this.isCreating.set(true);
    this.createError.set(null);
    try {
      const name = this.sessionName().trim() || undefined;
      const response = await this.sessionService.createSession(this.selectedDeck(), name);
      this.router.navigate(['/join', response.accessCode], { queryParams: { new: 'true' } });
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

  selectDeck(deck: DeckType): void {
    this.selectedDeck.set(deck);
  }
}
