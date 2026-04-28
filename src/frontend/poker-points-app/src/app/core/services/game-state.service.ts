import { Injectable, signal, computed, DestroyRef, inject } from '@angular/core';
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
import { canThrowEmojiAt } from './emoji-throw.utils';

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
  private readonly _sessionName = signal<string | null>(null);
  private readonly _currentParticipant = signal<Participant | null>(null);
  private readonly _participants = signal<Participant[]>([]);
  private readonly _currentStory = signal<Story | null>(null);
  private readonly _voteStatuses = signal<VoteStatus[]>([]);
  private readonly _revealedVotes = signal<Vote[] | null>(null);
  private readonly _deckType = signal<DeckType>('fibonacci');
  private readonly _myVote = signal<string | null>(null);
  private readonly _votingResults = signal<{ average: number | null; isConsensus: boolean } | null>(
    null,
  );
  private readonly _storyQueue = signal<Story[]>([]);
  private readonly _timerEndTime = signal<Date | null>(null);
  private readonly _timerDurationSeconds = signal<number>(0);
  private readonly _timerSecondsRemaining = signal<number>(0);
  private readonly _timerJustExpired = signal(false);
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  // Read-only public signals
  readonly sessionCode = this._sessionCode.asReadonly();
  readonly sessionName = this._sessionName.asReadonly();
  readonly currentParticipant = this._currentParticipant.asReadonly();
  readonly participants = this._participants.asReadonly();
  readonly currentStory = this._currentStory.asReadonly();
  readonly voteStatuses = this._voteStatuses.asReadonly();
  readonly revealedVotes = this._revealedVotes.asReadonly();
  readonly deckType = this._deckType.asReadonly();
  readonly myVote = this._myVote.asReadonly();
  readonly votingResults = this._votingResults.asReadonly();
  readonly storyQueue = this._storyQueue.asReadonly();
  readonly timerEndTime = this._timerEndTime.asReadonly();
  readonly timerSecondsRemaining = this._timerSecondsRemaining.asReadonly();
  readonly timerRunning = computed(
    () => this._timerEndTime() !== null && this._timerSecondsRemaining() > 0,
  );
  readonly timerJustExpired = this._timerJustExpired.asReadonly();

  // Computed signals
  readonly isInSession = computed(
    () => this._sessionCode() !== null && this._currentParticipant() !== null,
  );
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
        list.map((p) => (p.id === event.participantId ? { ...p, isConnected: false } : p)),
      );
    });

    this.signalR.hostTransferred$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this._participants.update((list) =>
        list.map((participant) => {
          if (participant.id === event.previousHostParticipantId) {
            return { ...participant, isOrganizer: false };
          }
          if (participant.id === event.newHost.id) {
            return event.newHost;
          }
          return participant;
        }),
      );

      const currentParticipant = this._currentParticipant();
      if (currentParticipant?.id === event.previousHostParticipantId) {
        this._currentParticipant.set({ ...currentParticipant, isOrganizer: false });
      } else if (currentParticipant?.id === event.newHost.id) {
        this._currentParticipant.set(event.newHost);
      }
    });

    this.signalR.voteCast$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this._voteStatuses.update((statuses) => {
        const existing = statuses.find((s) => s.participantId === event.participantId);
        if (existing) {
          return statuses.map((s) =>
            s.participantId === event.participantId ? { ...s, hasVoted: true } : s,
          );
        }
        return [...statuses, { participantId: event.participantId, hasVoted: true }];
      });
    });

    this.signalR.votesRevealed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this._revealedVotes.set(event.votes);
      this._votingResults.set({ average: event.average, isConsensus: event.isConsensus });
      this._timerJustExpired.set(false);
    });

    this.signalR.votesReset$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this._revealedVotes.set(null);
      this._votingResults.set(null);
      this._myVote.set(null);
      this._voteStatuses.set([]);
      this._timerJustExpired.set(false);
    });

    this.signalR.storyUpdated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this._currentStory.set(event.story);

      // Update story queue based on status changes
      if (event.story.status === 'completed') {
        // Add completed story to queue if not already there
        this._storyQueue.update((queue) => {
          const exists = queue.some((s) => s.id === event.story.id);
          if (exists) {
            // Update existing entry
            return queue.map((s) => (s.id === event.story.id ? event.story : s));
          }
          // Add to queue (completed stories appear at end)
          return [...queue, event.story];
        });
      } else if (event.story.status === 'active') {
        // Remove from queue when story becomes active (e.g., via Vote Again)
        this._storyQueue.update((queue) => queue.filter((s) => s.id !== event.story.id));
      }
    });

    this.signalR.sessionState$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((state) => {
      this.applyGameState(state);
    });

    this.signalR.error$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((message) => {
      console.error('SignalR error:', message);
    });

    this.signalR.storiesAdded$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((stories) => {
      this._storyQueue.update((queue) => [...queue, ...stories]);
    });

    this.signalR.storyDeleted$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((storyId) => {
      this._storyQueue.update((queue) => queue.filter((s) => s.id !== storyId));
    });

    this.signalR.storyQueueUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((stories) => {
        this._storyQueue.set(stories);
      });

    this.signalR.timerStarted$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.setTimerEndTime(new Date(event.endTimeUtc));
      this._timerDurationSeconds.set(event.durationSeconds);
    });

    this.signalR.timerExtended$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.setTimerEndTime(new Date(event.endTimeUtc));
    });

    this.signalR.timerStopped$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.clearTimer();
    });

    this.signalR.timerExpired$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.clearTimer();
      this._timerJustExpired.set(true);
    });

    this.signalR.reconnected$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      void this.restoreSessionAfterReconnect();
    });

    this.signalR.sessionEnded$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.clearSessionState();
    });
  }

  private applyGameState(state: GameState): void {
    this._participants.set(state.participants);
    this._currentStory.set(state.currentStory);
    this._voteStatuses.set(state.voteStatuses);
    this._revealedVotes.set(state.revealedVotes);
    this._deckType.set(state.session.deckType as DeckType);
    this._sessionName.set(state.session.name);

    const currentParticipant = this._currentParticipant();
    if (currentParticipant) {
      const updatedParticipant = state.participants.find((p) => p.id === currentParticipant.id);
      if (updatedParticipant) {
        this._currentParticipant.set(updatedParticipant);
      }
    }

    if (this._currentParticipant()?.isObserver) {
      this._myVote.set(null);
    }

    if (state.revealedVotes) {
      const myParticipant = this._currentParticipant();
      if (myParticipant) {
        const myVoteData = state.revealedVotes.find((v) => v.participantId === myParticipant.id);
        if (myVoteData) {
          this._myVote.set(myVoteData.cardValue);
        }
      }
    }

    // Restore timer state on reconnect
    if (state.activeTimer) {
      this.setTimerEndTime(new Date(state.activeTimer.endTimeUtc));
      this._timerDurationSeconds.set(state.activeTimer.durationSeconds);
    } else {
      this.clearTimer();
    }
  }

  async joinSession(
    sessionCode: string,
    displayName: string,
    isObserver: boolean,
  ): Promise<boolean> {
    try {
      await this.signalR.connect();

      const storedIdentity = this.getStoredIdentityForSession(sessionCode);
      const existingParticipantId = storedIdentity?.participantId;

      const participant = await this.signalR.joinSession(
        sessionCode,
        displayName,
        isObserver,
        existingParticipantId,
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

      // Fetch story queue
      await this.loadStoryQueue();

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

  async switchRole(isObserver: boolean): Promise<void> {
    const participant = await this.signalR.switchRole(isObserver);
    if (!participant) return;

    this._currentParticipant.set(participant);
    this._participants.update((participants) =>
      participants.map((item) => (item.id === participant.id ? participant : item)),
    );

    if (participant.isObserver) {
      this._myVote.set(null);
    }

    const sessionCode = this._sessionCode();
    if (sessionCode) {
      this.storeIdentity({
        sessionCode,
        participantId: participant.id,
        displayName: participant.displayName,
        isObserver: participant.isObserver,
      });
    }
  }

  async transferHost(targetParticipantId: string): Promise<boolean> {
    if (!this.isOrganizer()) return false;

    const newHost = await this.signalR.transferHost(targetParticipantId);
    if (!newHost) {
      throw new Error('Unable to transfer host controls.');
    }

    this._participants.update((participants) =>
      participants.map((participant) => ({
        ...participant,
        isOrganizer: participant.id === newHost.id,
        isConnected: participant.id === newHost.id ? newHost.isConnected : participant.isConnected,
      })),
    );

    const currentParticipant = this._currentParticipant();
    if (currentParticipant) {
      this._currentParticipant.update((participant) =>
        participant
          ? {
              ...participant,
              isOrganizer: participant.id === newHost.id,
            }
          : participant,
      );
    }

    return true;
  }

  async endSession(): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.endSession();
    this.clearSessionState();
    await this.signalR.disconnect();
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

  async addStories(stories: { title: string; url?: string }[]): Promise<Story[]> {
    if (!this.isOrganizer()) return [];
    return this.signalR.addStories(stories);
  }

  async loadStoryQueue(): Promise<void> {
    const queue = await this.signalR.getStoryQueue();
    this._storyQueue.set(queue);
  }

  async updateStoryDetails(storyId: string, title: string, url: string | null): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.updateStoryDetails(storyId, title, url);
  }

  async deleteStory(storyId: string): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.deleteStory(storyId);
  }

  async startStory(storyId: string): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.startStory(storyId);
  }

  async restartStory(storyId: string): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.restartStory(storyId);
  }

  async startTimer(): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.startTimer();
  }

  async extendTimer(additionalSeconds: number = 60): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.extendTimer(additionalSeconds);
  }

  async stopTimer(): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.signalR.stopTimer();
  }

  async throwEmoji(targetParticipantId: string, emoji: string): Promise<void> {
    if (
      !canThrowEmojiAt(this._currentParticipant(), this._participants(), targetParticipantId, emoji)
    )
      return;

    await this.signalR.throwEmoji(targetParticipantId, emoji);
  }

  dismissTimerExpired(): void {
    this._timerJustExpired.set(false);
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private setTimerEndTime(endTime: Date): void {
    this._timerEndTime.set(endTime);
    this.startLocalCountdown();
  }

  private clearTimer(): void {
    this._timerEndTime.set(null);
    this._timerSecondsRemaining.set(0);
    this.stopLocalCountdown();
  }

  private startLocalCountdown(): void {
    this.stopLocalCountdown();
    this.updateRemainingSeconds();
    this.timerInterval = setInterval(() => this.updateRemainingSeconds(), 250);
  }

  private stopLocalCountdown(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private updateRemainingSeconds(): void {
    const endTime = this._timerEndTime();
    if (!endTime) {
      this._timerSecondsRemaining.set(0);
      return;
    }
    const remaining = Math.max(0, Math.ceil((endTime.getTime() - Date.now()) / 1000));
    this._timerSecondsRemaining.set(remaining);
    if (remaining <= 0) {
      this.stopLocalCountdown();
    }
  }

  async attemptReconnect(sessionCode: string): Promise<boolean> {
    const storedIdentity = this.getStoredIdentityForSession(sessionCode);
    if (!storedIdentity) {
      return false;
    }

    return this.joinSession(
      storedIdentity.sessionCode,
      storedIdentity.displayName,
      storedIdentity.isObserver ?? false,
    );
  }

  private async restoreSessionAfterReconnect(): Promise<void> {
    const sessionCode = this._sessionCode();
    const currentParticipant = this._currentParticipant();
    if (!sessionCode || !currentParticipant) return;

    try {
      const reconnectedParticipant = await this.signalR.joinSession(
        sessionCode,
        currentParticipant.displayName,
        currentParticipant.isObserver,
        currentParticipant.id,
      );

      if (!reconnectedParticipant) return;

      this._currentParticipant.set(reconnectedParticipant);
      this.storeIdentity({
        sessionCode,
        participantId: reconnectedParticipant.id,
        displayName: reconnectedParticipant.displayName,
        isObserver: reconnectedParticipant.isObserver,
      });

      const gameState = await this.signalR.getSessionState();
      if (gameState) {
        this.applyGameState(gameState);
      }

      await this.loadStoryQueue();
    } catch (err) {
      console.error('Failed to restore session after reconnect:', err);
    }
  }

  private clearSessionState(): void {
    this._sessionCode.set(null);
    this._sessionName.set(null);
    this._currentParticipant.set(null);
    this._participants.set([]);
    this._currentStory.set(null);
    this._voteStatuses.set([]);
    this._revealedVotes.set(null);
    this._myVote.set(null);
    this._votingResults.set(null);
    // Note: We intentionally don't clear stored identity here
    this._storyQueue.set([]);
    // so users can rejoin with the same name if they come back
    this.clearTimer();
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

  // DEBUG: Add mock players for UI testing
  // Call from browser console: ng.getComponent(document.querySelector('app-game-room')).gameState.addMockPlayers(12)
  addMockPlayers(count: number): void {
    const names = [
      'Alice',
      'Bob',
      'Charlie',
      'Diana',
      'Eve',
      'Frank',
      'Grace',
      'Henry',
      'Ivy',
      'Jack',
      'Kate',
      'Leo',
      'Mia',
      'Noah',
      'Olivia',
      'Pete',
      'Quinn',
      'Rose',
    ];
    const current = this._participants();
    const mockPlayers: Participant[] = [];

    for (let i = 0; i < count && i < names.length; i++) {
      if (current.some((p) => p.displayName === names[i])) continue;

      mockPlayers.push({
        id: `mock-${i}-${Date.now()}`,
        displayName: names[i],
        isOrganizer: false,
        isObserver: false,
        isConnected: true,
      });
    }

    this._participants.set([...current, ...mockPlayers]);
    console.log(`Added ${mockPlayers.length} mock players. Total: ${this._participants().length}`);
  }

  // DEBUG: Remove all mock players
  removeMockPlayers(): void {
    const real = this._participants().filter((p) => !p.id.startsWith('mock-'));
    this._participants.set(real);
    console.log(`Removed mock players. Remaining: ${real.length}`);
  }
}
