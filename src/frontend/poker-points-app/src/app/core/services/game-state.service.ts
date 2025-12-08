import { Injectable, signal, computed, effect, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SignalRService } from './signalr.service';
import {
  GameState,
  Participant,
  Story,
  Vote,
  VoteStatus,
  DeckType,
  DECK_VALUES,
} from '../models/session.models';

interface StoredSessionIdentity {
  sessionCode: string;
  participantId: string;
  displayName: string;
  isObserver: boolean;
}

const SESSION_STORAGE_KEY_PREFIX = 'poker-points-session-';

@Injectable({
  providedIn: 'root',
})
export class GameStateService {
  private readonly signalR = inject(SignalRService);
  private readonly destroyRef = inject(DestroyRef);

  // Core game state signals
  private readonly _sessionCode = signal<string | null>(null);
  private readonly _currentParticipant = signal<Participant | null>(null);
  private readonly _participants = signal<Participant[]>([]);
  private readonly _currentStory = signal<Story | null>(null);
  private readonly _voteStatuses = signal<VoteStatus[]>([]);
  private readonly _revealedVotes = signal<Vote[] | null>(null);
  private readonly _deckType = signal<DeckType>('fibonacci');
  private readonly _myVote = signal<string | null>(null);
  private readonly _votingResults = signal<{ average: number | null; isConsensus: boolean } | null>(null);

  // Read-only public signals
  readonly sessionCode = this._sessionCode.asReadonly();
  readonly currentParticipant = this._currentParticipant.asReadonly();
  readonly participants = this._participants.asReadonly();
  readonly currentStory = this._currentStory.asReadonly();
  readonly voteStatuses = this._voteStatuses.asReadonly();
  readonly revealedVotes = this._revealedVotes.asReadonly();
  readonly deckType = this._deckType.asReadonly();
  readonly myVote = this._myVote.asReadonly();
  readonly votingResults = this._votingResults.asReadonly();

  // Computed signals
  readonly isInSession = computed(() => this._sessionCode() !== null && this._currentParticipant() !== null);
  readonly isOrganizer = computed(() => this._currentParticipant()?.isOrganizer ?? false);
  readonly isObserver = computed(() => this._currentParticipant()?.isObserver ?? false);
  readonly canVote = computed(() => !this.isObserver() && this._revealedVotes() === null);
  readonly hasVoted = computed(() => this._myVote() !== null);
  readonly votesRevealed = computed(() => this._revealedVotes() !== null);
  readonly deckValues = computed(() => DECK_VALUES[this._deckType()]);

  readonly voters = computed(() => this._participants().filter((p) => !p.isObserver));
  readonly observers = computed(() => this._participants().filter((p) => p.isObserver));

  readonly participantVoteMap = computed(() => {
    const statuses = this._voteStatuses();
    return new Map(statuses.map((s) => [s.participantId, s.hasVoted]));
  });

  readonly allVotersVoted = computed(() => {
    const votersList = this.voters();
    const voteMap = this.participantVoteMap();
    return votersList.length > 0 && votersList.every((v) => voteMap.get(v.id));
  });

  readonly voteDistribution = computed(() => {
    const votes = this._revealedVotes();
    if (!votes) return [];

    const counts = new Map<string, number>();
    for (const vote of votes) {
      const value = vote.cardValue ?? '?';
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  });

  constructor() {
    this.subscribeToSignalREvents();
  }

  private subscribeToSignalREvents(): void {
    this.signalR.userJoined$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this._participants.update((list) => {
        const existing = list.find((p) => p.id === event.participant.id);
        if (existing) {
          return list.map((p) => (p.id === event.participant.id ? event.participant : p));
        }
        return [...list, event.participant];
      });
    });

    this.signalR.userLeft$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this._participants.update((list) =>
        list.map((p) => (p.id === event.participantId ? { ...p, isConnected: false } : p))
      );
    });

    this.signalR.voteCast$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this._voteStatuses.update((statuses) => {
        const existing = statuses.find((s) => s.participantId === event.participantId);
        if (existing) {
          return statuses.map((s) =>
            s.participantId === event.participantId ? { ...s, hasVoted: true } : s
          );
        }
        return [...statuses, { participantId: event.participantId, hasVoted: true }];
      });
    });

    this.signalR.votesRevealed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this._revealedVotes.set(event.votes);
      this._votingResults.set({ average: event.average, isConsensus: event.isConsensus });
    });

    this.signalR.votesReset$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this._revealedVotes.set(null);
      this._votingResults.set(null);
      this._myVote.set(null);
      this._voteStatuses.set([]);
    });

    this.signalR.storyUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this._currentStory.set(event.story);
    });

    this.signalR.sessionState$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((state) => {
      this.applyGameState(state);
    });

    this.signalR.error$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((message) => {
      console.error('SignalR error:', message);
    });
  }

  private applyGameState(state: GameState): void {
    this._participants.set(state.participants);
    this._currentStory.set(state.currentStory);
    this._voteStatuses.set(state.voteStatuses);
    this._revealedVotes.set(state.revealedVotes);
    this._deckType.set(state.session.deckType as DeckType);

    if (state.revealedVotes) {
      const myParticipant = this._currentParticipant();
      if (myParticipant) {
        const myVoteData = state.revealedVotes.find((v) => v.participantId === myParticipant.id);
        if (myVoteData) {
          this._myVote.set(myVoteData.cardValue);
        }
      }
    }
  }

  async joinSession(sessionCode: string, displayName: string, isObserver: boolean): Promise<boolean> {
    try {
      await this.signalR.connect();

      const storedIdentity = this.getStoredIdentityForSession(sessionCode);
      const existingParticipantId = storedIdentity?.participantId;

      const participant = await this.signalR.joinSession(
        sessionCode,
        displayName,
        isObserver,
        existingParticipantId
      );

      if (!participant) {
        return false;
      }

      this._sessionCode.set(sessionCode.toUpperCase());
      this._currentParticipant.set(participant);

      this.storeIdentity({
        sessionCode: sessionCode.toUpperCase(),
        participantId: participant.id,
        displayName: participant.displayName,
        isObserver: participant.isObserver,
      });

      // Fetch full game state
      const gameState = await this.signalR.getSessionState();
      if (gameState) {
        this.applyGameState(gameState);
      }

      return true;
    } catch (err) {
      console.error('Failed to join session:', err);
      return false;
    }
  }

  async leaveSession(): Promise<void> {
    try {
      await this.signalR.leaveSession();
    } finally {
      this.clearSessionState();
      await this.signalR.disconnect();
    }
  }

  async castVote(cardValue: string): Promise<void> {
    if (!this.canVote()) return;

    await this.signalR.castVote(cardValue);
    this._myVote.set(cardValue);
  }

  async revealVotes(): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.revealVotes();
  }

  async resetVotes(): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.resetVotes();
  }

  async updateStory(title: string): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.updateStory(title);
  }

  async nextStory(title?: string): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.nextStory(title);
  }

  async attemptReconnect(sessionCode: string): Promise<boolean> {
    const storedIdentity = this.getStoredIdentityForSession(sessionCode);
    if (!storedIdentity) {
      return false;
    }

    return this.joinSession(
      storedIdentity.sessionCode,
      storedIdentity.displayName,
      storedIdentity.isObserver ?? false
    );
  }

  private clearSessionState(): void {
    this._sessionCode.set(null);
    this._currentParticipant.set(null);
    this._participants.set([]);
    this._currentStory.set(null);
    this._voteStatuses.set([]);
    this._revealedVotes.set(null);
    this._myVote.set(null);
    this._votingResults.set(null);
    // Note: We intentionally don't clear stored identity here
    // so users can rejoin with the same name if they come back
  }

  private getStorageKey(sessionCode: string): string {
    return `${SESSION_STORAGE_KEY_PREFIX}${sessionCode.toUpperCase()}`;
  }

  private storeIdentity(identity: StoredSessionIdentity): void {
    const key = this.getStorageKey(identity.sessionCode);
    localStorage.setItem(key, JSON.stringify(identity));
  }

  getStoredIdentityForSession(sessionCode: string): StoredSessionIdentity | null {
    const key = this.getStorageKey(sessionCode);
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as StoredSessionIdentity;
    } catch {
      return null;
    }
  }
}
