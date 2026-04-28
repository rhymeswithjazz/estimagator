import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
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
} from '../models/session.models';
import { GameStateService } from './game-state.service';
import { SignalRService } from './signalr.service';

class MockSignalRService {
  readonly userJoined$ = new Subject<UserJoinedEvent>();
  readonly userLeft$ = new Subject<UserLeftEvent>();
  readonly hostTransferred$ = new Subject<HostTransferredEvent>();
  readonly voteCast$ = new Subject<VoteCastEvent>();
  readonly votesRevealed$ = new Subject<VotesRevealedEvent>();
  readonly votesReset$ = new Subject<VotesResetEvent>();
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
  readonly reconnected$ = new Subject<void>();
  readonly sessionEnded$ = new Subject<void>();

  readonly connect = vi.fn().mockResolvedValue(undefined);
  readonly disconnect = vi.fn().mockResolvedValue(undefined);
  readonly joinSession = vi.fn();
  readonly getSessionState = vi.fn();
  readonly getStoryQueue = vi.fn().mockResolvedValue([]);
  readonly transferHost = vi.fn();
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

  async function joinAsHost(): Promise<void> {
    signalR.joinSession.mockResolvedValue(hostParticipant);
    signalR.getSessionState.mockResolvedValue(
      createGameState([hostParticipant, targetParticipant]),
    );

    const joined = await service.joinSession('ABC123', 'Host', false);

    expect(joined).toBe(true);
  }
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
