import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../core/services/session.service';
import { GameStateService } from '../../core/services/game-state.service';

@Component({
  selector: 'app-join-session',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './join-session.component.html',
})
export class JoinSessionComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly sessionService = inject(SessionService);
  private readonly gameState = inject(GameStateService);

  readonly sessionCode = signal('');
  readonly displayName = signal('');
  readonly isObserver = signal(false);
  readonly isJoining = signal(false);
  readonly isNewSession = signal(false);
  readonly error = signal<string | null>(null);
  readonly isLoading = signal(true);
  readonly sessionNotFound = signal(false);

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code');
    const isNew = this.route.snapshot.queryParamMap.get('new') === 'true';

    if (!code) {
      this.router.navigate(['/']);
      return;
    }

    this.sessionCode.set(code.toUpperCase());
    this.isNewSession.set(isNew);
    this.validateSession(code);
  }

  private async validateSession(code: string): Promise<void> {
    try {
      const exists = await this.sessionService.sessionExists(code);
      if (!exists) {
        this.sessionNotFound.set(true);
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
      const joined = await this.gameState.joinSession(
        this.sessionCode(),
        name,
        this.isObserver()
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

  goBack(): void {
    this.router.navigate(['/']);
  }
}
