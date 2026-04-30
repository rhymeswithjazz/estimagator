import { signal, ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { fireEvent, screen, waitFor } from '@testing-library/angular';
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { GameStateService } from '../../core/services/game-state.service';
import { SessionService } from '../../core/services/session.service';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  it('allows guests to open the create game flow', async () => {
    await renderHome();

    expect(screen.queryByText('Sign in to Start Game')).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: /start new game/i }));
    fixtureDetectChanges();

    expect(screen.getByText('Create New Game')).toBeInTheDocument();
  });

  it('requires a host name before creating a guest game', async () => {
    const { sessionService } = await renderHome();

    await fireEvent.click(screen.getByRole('button', { name: /start new game/i }));
    fixtureDetectChanges();
    await fireEvent.click(screen.getByRole('button', { name: /^create game$/i }));
    fixtureDetectChanges();

    expect(screen.getByText('Please enter your name')).toBeInTheDocument();
    expect(sessionService.createSession).not.toHaveBeenCalled();
  });

  it('creates a guest game, stores the host token, and joins the creator', async () => {
    const { sessionService, gameState, navigate } = await renderHome();

    await fireEvent.click(screen.getByRole('button', { name: /start new game/i }));
    fixtureDetectChanges();
    await fireEvent.input(screen.getByPlaceholderText('e.g., Riley'), {
      target: { value: 'Riley' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /^create game$/i }));

    await waitFor(() => {
      expect(sessionService.createSession).toHaveBeenCalledWith('fibonacci', undefined, 300);
      expect(gameState.storeGuestHostToken).toHaveBeenCalledWith('ABC123', 'guest-token');
      expect(gameState.joinSession).toHaveBeenCalledWith('ABC123', 'Riley', false, 'guest-token');
      expect(navigate).toHaveBeenCalledWith(['/game', 'ABC123']);
    });
  });

  it('creates a verified user game and joins with the account display name', async () => {
    const { gameState, navigate } = await renderHome({
      user: {
        id: 'user-id',
        email: 'verified@example.com',
        displayName: 'Verified User',
        createdAt: '2026-01-01T00:00:00Z',
        emailVerified: true,
        role: 'User',
      },
      createResponse: {
        sessionId: 'session-id',
        accessCode: 'ABC123',
        name: null,
        timerDurationSeconds: 300,
        guestHostToken: null,
      },
    });

    await fireEvent.click(screen.getByRole('button', { name: /start new game/i }));
    fixtureDetectChanges();
    expect(screen.queryByPlaceholderText('e.g., Riley')).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: /^create game$/i }));

    await waitFor(() => {
      expect(gameState.storeGuestHostToken).not.toHaveBeenCalled();
      expect(gameState.joinSession).toHaveBeenCalledWith(
        'ABC123',
        'Verified User',
        false,
        undefined,
      );
      expect(navigate).toHaveBeenCalledWith(['/game', 'ABC123']);
    });
  });
});

let fixture: ComponentFixture<HomeComponent> | null = null;

function fixtureDetectChanges() {
  fixture?.detectChanges();
}

async function renderHome(options: { user?: unknown; createResponse?: unknown } = {}) {
  window.matchMedia ??= vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  const authService = {
    isAuthenticated: signal(!!options.user),
    user: signal(options.user ?? null),
  };
  const sessionService = {
    createSession: vi.fn().mockResolvedValue(options.createResponse ?? {
      sessionId: 'session-id',
      accessCode: 'ABC123',
      name: null,
      timerDurationSeconds: 300,
      guestHostToken: 'guest-token',
    }),
    sessionExists: vi.fn(),
  };
  const gameState = {
    storeGuestHostToken: vi.fn(),
    joinSession: vi.fn().mockResolvedValue(true),
  };

  await resolveComponentResources((url) => readFile(new URL(url, import.meta.url), 'utf-8'));

  await TestBed.configureTestingModule({
    imports: [HomeComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: authService },
      { provide: SessionService, useValue: sessionService },
      { provide: GameStateService, useValue: gameState },
    ],
  }).compileComponents();

  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture = TestBed.createComponent(HomeComponent);
  fixture.detectChanges();

  return { sessionService, gameState, navigate };
}
