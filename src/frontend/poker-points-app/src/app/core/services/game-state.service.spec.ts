import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CardBackChangedEvent,
  GameState,
  HostTransferredEvent,
  Participant,
  Story,
  TimerExtendedEvent,
  TimerStartedEvent,
  UserJoinedEvent,
  UserLeftEvent,
  VoteCastEvent,
  VotesResetEvent,
  VotesRevealedEvent,
  StoryUpdatedEvent,
  EmojiThrownEvent,
  EmojiReactionSentEvent,
} from '../models/session.models';
import { GameStateService } from './game-state.service';
import { SignalRService } from './signalr.service';

class MockSignalRService {
  readonly cardBackChanged$ = new Subject<CardBackChangedEvent>();
  readonly setCardBack = vi.fn().mockResolvedValue(undefined);
  readonly userJoined$ = new Subject<UserJoinedEvent>();
  readonly userLeft$ = new Subject<UserLeftEvent>();
  readonly hostTransferred$ = new Subject<HostTransferredEvent>();
  readonly voteCast$ = new Subject<VoteCastEvent>();
  readonly votesRevealed$ = new Subject<VotesRevealedEvent>();
  readonly votesReset$ = new Subject<VotesResetEvent>();
  readonly storyEstimateUpdated$ = new Subject<Story>();
  readonly storyUpdated$ = new Subject<StoryUpdatedEvent>();
  readonly sessionState$ = new Subject<GameState>();
  readonly error$ = new Subject<string>();
  readonly storiesAdded$ = new Subject<Story[]>();
  readonly storyDeleted$ = new Subject<string>();
  readonly storyQueueUpdated$ = new Subject<Story[]>();
  readonly timerStarted$ = new Subject<TimerStartedEvent>();
  readonly timerExtended$ = new Subject<TimerExtendedEvent>();
  readonly timerStopped$ = new Subject<void>();
  readonly timerExpired$ = new Subject<void>();
  readonly emojiThrown$ = new Subject<EmojiThrownEvent>();
  readonly emojiReactionSent$ = new Subject<EmojiReactionSentEvent>();
  readonly reconnected$ = new Subject<void>();
  readonly sessionEnded$ = new Subject<void>();

  readonly connect = vi.fn().mockResolvedValue(undefined);
  readonly disconnect = vi.fn().mockResolvedValue(undefined);
  readonly joinSession = vi.fn();
  readonly getSessionState = vi.fn();
  readonly getStoryQueue = vi.fn().mockResolvedValue([]);
  readonly transferHost = vi.fn();
  readonly switchRole = vi.fn();
  readonly castVote = vi.fn().mockResolvedValue(undefined);
  readonly sendEmojiReaction = vi.fn().mockResolvedValue(undefined);
}

describe('GameStateService', () => {
  let service: GameStateService;
  let signalR: MockSignalRService;

  beforeEach(async () => {
    localStorage.clear();
    signalR = new MockSignalRService();

    TestBed.configureTestingModule({
      providers: [{ provide: SignalRService, useValue: signalR }],
    });

    service = TestBed.inject(GameStateService);
    await joinAsHost();
  });

  it('updates current participant and participants from refreshed session state', () => {
    signalR.sessionState$.next(
      createGameState([
        { ...hostParticipant, isOrganizer: false },
        { ...targetParticipant, isOrganizer: true },
      ]),
    );

    expect(service.currentParticipant()?.isOrganizer).toBe(false);
    expect(
      service.participants().find((participant) => participant.id === 'target-id')?.isOrganizer,
    ).toBe(true);
  });

  it('updates local host flags after transferring host', async () => {
    signalR.transferHost.mockResolvedValue({ ...targetParticipant, isOrganizer: true });

    const transferred = await service.transferHost('target-id');

    expect(transferred).toBe(true);
    expect(service.currentParticipant()?.isOrganizer).toBe(false);
    expect(
      service.participants().find((participant) => participant.id === 'target-id')?.isOrganizer,
    ).toBe(true);
  });

  it('updates a historical estimate without replacing the current story', () => {
    const current: Story = {
      id: 'current',
      title: 'Current',
      url: null,
      status: 'active',
      finalScore: null,
    };
    const historical: Story = {
      id: 'history',
      title: 'History',
      url: null,
      status: 'completed',
      finalScore: 5.5,
    };
    signalR.storyUpdated$.next({ story: current });
    signalR.storyQueueUpdated$.next([historical]);
    signalR.storyEstimateUpdated$.next({ ...historical, agreedEstimate: 5, estimateRevision: 1 });
    expect(service.currentStory()?.id).toBe('current');
    expect(service.storyQueue()[0].agreedEstimate).toBe(5);
  });

  it('sends allowed emoji reactions for the current participant', async () => {
    await service.sendEmojiReaction('💯');

    expect(signalR.sendEmojiReaction).toHaveBeenCalledWith('💯');
  });

  it('does not send unsupported emoji reactions', async () => {
    await service.sendEmojiReaction('🎯');

    expect(signalR.sendEmojiReaction).not.toHaveBeenCalled();
  });

  it('stores caller-only proof and sends it on refresh without adding it to public state', async () => {
    expect(service.getStoredIdentityForSession('ABC123')?.reconnectToken).toBe('guest-proof');
    expect(service.currentParticipant()).not.toHaveProperty('reconnectToken');
    await service.attemptReconnect('ABC123');
    expect(signalR.joinSession).toHaveBeenLastCalledWith(
      'ABC123',
      'Host',
      false,
      'host-id',
      undefined,
      'guest-proof',
    );
  });

  it('preserves proof through role changes and automatic transport reconnect', async () => {
    signalR.switchRole.mockResolvedValue({ ...hostParticipant, isObserver: true });
    await service.switchRole(true);
    expect(service.getStoredIdentityForSession('ABC123')?.reconnectToken).toBe('guest-proof');
    signalR.joinSession.mockResolvedValue({
      participant: { ...hostParticipant, isObserver: true },
      reconnectToken: 'guest-proof',
    });
    signalR.reconnected$.next();
    await vi.waitFor(() =>
      expect(signalR.joinSession).toHaveBeenLastCalledWith(
        'ABC123',
        'Host',
        true,
        'host-id',
        undefined,
        'guest-proof',
      ),
    );
    await vi.waitFor(() =>
      expect(service.getStoredIdentityForSession('ABC123')?.isObserver).toBe(true),
    );
    expect(service.getStoredIdentityForSession('ABC123')?.reconnectToken).toBe('guest-proof');
  });

  it('does not silently create a new participant after reconnect rejection', async () => {
    signalR.joinSession.mockRejectedValue(new Error('Unable to verify participant'));
    signalR.joinSession.mockClear();
    expect(await service.attemptReconnect('ABC123')).toBe(false);
    expect(signalR.joinSession).toHaveBeenCalledTimes(1);
    expect(service.getStoredIdentityForSession('ABC123')?.reconnectToken).toBe('guest-proof');
  });

  it('clears only reconnect identity when the user explicitly chooses a new participant', async () => {
    service.storeGuestHostToken('ABC123', 'creator-reservation');
    service.forgetParticipantIdentity('ABC123');
    await service.joinSession('ABC123', 'New guest', false);
    expect(signalR.joinSession).toHaveBeenLastCalledWith(
      'ABC123',
      'New guest',
      false,
      undefined,
      'creator-reservation',
      undefined,
    );
  });

  it('discards the guest proof when a verified reconnect links the participant to an account', async () => {
    signalR.joinSession.mockResolvedValue({ participant: hostParticipant, reconnectToken: null });
    await service.attemptReconnect('ABC123');
    expect(service.getStoredIdentityForSession('ABC123')?.participantId).toBe('host-id');
    expect(service.getStoredIdentityForSession('ABC123')?.reconnectToken).toBeUndefined();
  });

  it('does not reuse a room proof for another room', async () => {
    await service.joinSession('OTHER1', 'Host', false);
    expect(signalR.joinSession).toHaveBeenLastCalledWith(
      'OTHER1',
      'Host',
      false,
      undefined,
      undefined,
      undefined,
    );
  });

  it('restores revealed results and selected vote from a reconnect snapshot', async () => {
    const state = revealedState();
    signalR.getSessionState.mockResolvedValue(state);
    await service.attemptReconnect('ABC123');
    expect(service.currentStory()?.id).toBe('revealed-story');
    expect(service.votesRevealed()).toBe(true);
    expect(service.votingResults()).toEqual({ average: 6.5, isConsensus: false });
    expect(service.myVote()).toBe('5');
    expect(service.canVote()).toBe(false);
    await service.castVote('13');
    expect(signalR.castVote).not.toHaveBeenCalled();
  });

  it('retains revealed results when host and participant roles change', () => {
    const state = revealedState();
    state.participants = [
      { ...hostParticipant, isOrganizer: false, isObserver: true },
      { ...targetParticipant, isOrganizer: true },
    ];
    signalR.sessionState$.next(state);
    expect(service.votingResults()?.average).toBe(6.5);
    expect(service.revealedVotes()).toHaveLength(2);
    expect(service.isOrganizer()).toBe(false);
    expect(service.myVote()).toBeNull();
  });

  it('clears stale results and selection when a snapshot shows a reset round', () => {
    const state = revealedState();
    signalR.sessionState$.next(state);
    signalR.sessionState$.next({
      ...state,
      currentStory: { ...state.currentStory!, status: 'active', finalScore: null },
      revealedVotes: null,
      votingResults: null,
      voteStatuses: [{ participantId: hostParticipant.id, hasVoted: false }],
    });
    expect(service.votesRevealed()).toBe(false);
    expect(service.votingResults()).toBeNull();
    expect(service.myVote()).toBeNull();
    expect(service.canVote()).toBe(true);
  });

  it('treats an empty completed round as revealed', () => {
    signalR.sessionState$.next({
      ...revealedState(),
      revealedVotes: [],
      votingResults: { average: null, isConsensus: false },
    });
    expect(service.votesRevealed()).toBe(true);
    expect(service.votingResults()).toEqual({ average: null, isConsensus: false });
    expect(service.myVote()).toBeNull();
    expect(service.canVote()).toBe(false);
  });

  it('clears the displayed results when the current story is deleted', () => {
    signalR.sessionState$.next(revealedState());
    signalR.storyDeleted$.next('revealed-story');
    expect(service.currentStory()).toBeNull();
    expect(service.votingResults()).toBeNull();
    expect(service.revealedVotes()).toBeNull();
    expect(service.myVote()).toBeNull();
    expect(service.canVote()).toBe(false);
  });

  it('clears the previous round timer and results when voting resets', () => {
    signalR.sessionState$.next(revealedState());
    signalR.timerStarted$.next({
      endTimeUtc: new Date(Date.now() + 60000).toISOString(),
      durationSeconds: 60,
    });
    expect(service.timerRunning()).toBe(true);
    signalR.votesReset$.next({ storyId: 'revealed-story' });
    expect(service.timerRunning()).toBe(false);
    expect(service.revealedVotes()).toBeNull();
    expect(service.votingResults()).toBeNull();
    expect(service.myVote()).toBeNull();
  });

  function revealedState(): GameState {
    return {
      ...createGameState([hostParticipant, targetParticipant]),
      currentStory: {
        id: 'revealed-story',
        title: 'Story',
        url: null,
        status: 'completed',
        finalScore: 6.5,
      },
      revealedVotes: [
        { participantId: hostParticipant.id, displayName: 'Host', cardValue: '5' },
        { participantId: targetParticipant.id, displayName: 'Target', cardValue: '8' },
      ],
      votingResults: { average: 6.5, isConsensus: false },
    };
  }

  async function joinAsHost(): Promise<void> {
    signalR.joinSession.mockResolvedValue({
      participant: hostParticipant,
      reconnectToken: 'guest-proof',
    });
    signalR.getSessionState.mockResolvedValue(
      createGameState([hostParticipant, targetParticipant]),
    );

    const joined = await service.joinSession('ABC123', 'Host', false);

    expect(joined).toBe(true);
  }

  it('takes the card back from the session snapshot', () => {
    const state = createGameState([hostParticipant]);
    signalR.sessionState$.next({
      ...state,
      session: { ...state.session, cardBack: 'scout-night' },
    });

    expect(service.cardBack()).toBe('scout-night');
  });

  it('updates the card back when the host changes it', () => {
    signalR.cardBackChanged$.next({ cardBack: 'retro-sunset' });

    expect(service.cardBack()).toBe('retro-sunset');
  });

  it('falls back to classic red for a card back it does not know', () => {
    signalR.cardBackChanged$.next({ cardBack: 'tartan' });

    expect(service.cardBack()).toBe('classic-red');
  });
});

const hostParticipant: Participant = {
  id: 'host-id',
  displayName: 'Host',
  isObserver: false,
  isOrganizer: true,
  isConnected: true,
};

const targetParticipant: Participant = {
  id: 'target-id',
  displayName: 'Target',
  isObserver: true,
  isOrganizer: false,
  isConnected: true,
};

function createGameState(participants: Participant[]): GameState {
  return {
    session: {
      id: 'session-id',
      accessCode: 'ABC123',
      name: 'Planning',
      deckType: 'fibonacci',
      timerDurationSeconds: 300,
      cardBack: 'classic-red',
      isActive: true,
      createdAt: new Date().toISOString(),
      participants,
      currentStory: null,
    },
    currentStory: null,
    participants,
    voteStatuses: [],
    revealedVotes: null,
    activeTimer: null,
  };
}
