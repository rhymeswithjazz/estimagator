import { Injectable, inject, signal, computed } from '@angular/core';
import type { HubConnection } from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  GameState,
  JoinSessionResponse,
  Participant,
  UserJoinedEvent,
  UserLeftEvent,
  VoteCastEvent,
  VotesRevealedEvent,
  VotesResetEvent,
  StoryUpdatedEvent,
  TimerStartedEvent,
  TimerExtendedEvent,
  Story,
  EmojiThrownEvent,
  EmojiReactionSentEvent,
  HostTransferredEvent,
} from '../models/session.models';
import { AuthService } from './auth.service';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

@Injectable({
  providedIn: 'root',
})
export class SignalRService {
  private readonly authService = inject(AuthService);
  private connection: HubConnection | null = null;
  private connecting: Promise<void> | null = null;

  // Connection state as Signal
  private readonly _connectionState = signal<ConnectionState>('disconnected');
  readonly connectionState = this._connectionState.asReadonly();
  readonly isConnected = computed(() => this._connectionState() === 'connected');

  // Event streams
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

  connect(): Promise<void> {
    return (this.connecting ??= this.open().finally(() => (this.connecting = null)));
  }

  private async open(): Promise<void> {
    const { HubConnectionBuilder, HubConnectionState, LogLevel } =
      await import('@microsoft/signalr');

    if (this.connection?.state === HubConnectionState.Connected) {
      return;
    }

    await this.connection?.stop();
    this._connectionState.set('connecting');

    this.connection = new HubConnectionBuilder()
      .withUrl(environment.hubUrl, {
        accessTokenFactory: () => this.authService.getValidAccessToken(),
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          // Exponential backoff: 0, 2s, 4s, 8s, 16s, then 30s max
          if (retryContext.previousRetryCount === 0) return 0;
          const delay = Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
          return delay;
        },
      })
      .configureLogging(LogLevel.Information)
      .build();

    this.registerEventHandlers();
    this.registerConnectionEvents();

    try {
      await this.connection.start();
      this._connectionState.set('connected');
    } catch (err) {
      this._connectionState.set('disconnected');
      console.error('SignalR connection failed:', err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    if (!connection) return;

    this.connection = null;
    this._connectionState.set('disconnected');
    await connection.stop();
  }

  private registerEventHandlers(): void {
    if (!this.connection) return;

    this.connection.on('UserJoined', (event: UserJoinedEvent) => {
      this.userJoined$.next(event);
    });

    this.connection.on('UserLeft', (event: UserLeftEvent) => {
      this.userLeft$.next(event);
    });

    this.connection.on('HostTransferred', (event: HostTransferredEvent) => {
      this.hostTransferred$.next(event);
    });

    this.connection.on('VoteCast', (event: VoteCastEvent) => {
      this.voteCast$.next(event);
    });

    this.connection.on('VotesRevealed', (event: VotesRevealedEvent) => {
      this.votesRevealed$.next(event);
    });

    this.connection.on('VotesReset', (event: VotesResetEvent) => {
      this.votesReset$.next(event);
    });

    this.connection.on('StoryEstimateUpdated', (story: Story) =>
      this.storyEstimateUpdated$.next(story),
    );

    this.connection.on('StoryUpdated', (event: StoryUpdatedEvent) => {
      this.storyUpdated$.next(event);
    });

    this.connection.on('SessionState', (state: GameState) => {
      this.sessionState$.next(state);
    });

    this.connection.on('Error', (message: string) => {
      this.error$.next(message);
    });

    this.connection.on('StoriesAdded', (stories: Story[]) => {
      this.storiesAdded$.next(stories);
    });

    this.connection.on('StoryDeleted', (storyId: string) => {
      this.storyDeleted$.next(storyId);
    });

    this.connection.on('StoryQueueUpdated', (stories: Story[]) => {
      this.storyQueueUpdated$.next(stories);
    });

    this.connection.on('TimerStarted', (event: TimerStartedEvent) => {
      this.timerStarted$.next(event);
    });

    this.connection.on('TimerExtended', (event: TimerExtendedEvent) => {
      this.timerExtended$.next(event);
    });

    this.connection.on('TimerStopped', () => {
      this.timerStopped$.next();
    });

    this.connection.on('TimerExpired', () => {
      this.timerExpired$.next();
    });

    this.connection.on('EmojiThrown', (event: EmojiThrownEvent) => {
      this.emojiThrown$.next(event);
    });

    this.connection.on('EmojiReactionSent', (event: EmojiReactionSentEvent) => {
      this.emojiReactionSent$.next(event);
    });

    this.connection.on('SessionEnded', () => {
      this.sessionEnded$.next();
    });
  }

  private registerConnectionEvents(): void {
    const connection = this.connection;
    if (!connection) return;

    connection.onreconnecting(() => {
      if (this.connection !== connection) return;
      this._connectionState.set('reconnecting');
      console.log('SignalR reconnecting...');
    });

    connection.onreconnected(() => {
      if (this.connection !== connection) return;
      this._connectionState.set('connected');
      this.reconnected$.next();
      console.log('SignalR reconnected');
    });

    connection.onclose(() => {
      if (this.connection !== connection) return;
      this._connectionState.set('disconnected');
      console.log('SignalR connection closed');
    });
  }

  // Hub methods
  async joinSession(
    sessionCode: string,
    displayName: string,
    isObserver: boolean,
    existingParticipantId?: string,
    guestHostToken?: string,
    reconnectToken?: string,
  ): Promise<JoinSessionResponse | null> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    return this.connection.invoke<JoinSessionResponse | null>(
      'JoinSession',
      sessionCode,
      displayName,
      isObserver,
      existingParticipantId ?? null,
      guestHostToken ?? null,
      reconnectToken ?? null,
    );
  }

  async leaveSession(): Promise<void> {
    if (!this.connection) return;
    await this.connection.invoke('LeaveSession');
  }

  async castVote(cardValue: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('CastVote', cardValue);
  }

  async switchRole(isObserver: boolean): Promise<Participant | null> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    return this.connection.invoke<Participant | null>('SwitchRole', isObserver);
  }

  async transferHost(targetParticipantId: string): Promise<Participant | null> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    return this.connection.invoke<Participant | null>('TransferHost', targetParticipantId);
  }

  async endSession(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('EndSession');
  }

  async revealVotes(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('RevealVotes');
  }

  async resetVotes(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('ResetVotes');
  }

  async updateStory(title: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('UpdateStory', title);
  }

  async nextStory(title?: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('NextStory', title ?? null);
  }

  async getSessionState(): Promise<GameState | null> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    return this.connection.invoke<GameState | null>('GetSessionState');
  }

  async addStories(stories: { title: string; url?: string }[]): Promise<Story[]> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    return this.connection.invoke<Story[]>('AddStories', stories);
  }

  async getStoryQueue(): Promise<Story[]> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    return this.connection.invoke<Story[]>('GetStoryQueue');
  }

  async updateStoryDetails(storyId: string, title: string, url: string | null): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('UpdateStoryDetails', storyId, title, url);
  }

  async deleteStory(storyId: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('DeleteStory', storyId);
  }

  async startStory(storyId: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('StartStory', storyId);
  }

  async restartStory(storyId: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('RestartStory', storyId);
  }

  async startTimer(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('StartTimer');
  }

  async extendTimer(additionalSeconds: number = 60): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('ExtendTimer', additionalSeconds);
  }

  async stopTimer(): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('StopTimer');
  }

  async throwEmoji(targetParticipantId: string, emoji: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('ThrowEmoji', targetParticipantId, emoji);
  }

  async sendEmojiReaction(emoji: string): Promise<void> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    await this.connection.invoke('SendEmojiReaction', emoji);
  }
}
