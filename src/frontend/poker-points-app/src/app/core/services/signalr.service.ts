import { Injectable, inject, signal, computed } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  GameState,
  Participant,
  UserJoinedEvent,
  UserLeftEvent,
  VoteCastEvent,
  VotesRevealedEvent,
  VotesResetEvent,
  StoryUpdatedEvent,
} from '../models/session.models';
import { Story } from '../models/session.models';
import { AuthService } from './auth.service';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

@Injectable({
  providedIn: 'root',
})
export class SignalRService {
  private readonly authService = inject(AuthService);
  private connection: signalR.HubConnection | null = null;

  // Connection state as Signal
  private readonly _connectionState = signal<ConnectionState>('disconnected');
  readonly connectionState = this._connectionState.asReadonly();
  readonly isConnected = computed(() => this._connectionState() === 'connected');

  // Event streams
  readonly userJoined$ = new Subject<UserJoinedEvent>();
  readonly userLeft$ = new Subject<UserLeftEvent>();
  readonly voteCast$ = new Subject<VoteCastEvent>();
  readonly votesRevealed$ = new Subject<VotesRevealedEvent>();
  readonly votesReset$ = new Subject<VotesResetEvent>();
  readonly storyUpdated$ = new Subject<StoryUpdatedEvent>();
  readonly sessionState$ = new Subject<GameState>();
  readonly error$ = new Subject<string>();
  readonly storiesAdded$ = new Subject<Story[]>();
  readonly storyDeleted$ = new Subject<string>();
  readonly storyQueueUpdated$ = new Subject<Story[]>();

  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    this._connectionState.set('connecting');

    const token = this.authService.accessToken();

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(environment.hubUrl, {
        accessTokenFactory: token ? () => token : undefined,
      })
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          // Exponential backoff: 0, 2s, 4s, 8s, 16s, then 30s max
          if (retryContext.previousRetryCount === 0) return 0;
          const delay = Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000);
          return delay;
        },
      })
      .configureLogging(signalR.LogLevel.Information)
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
    if (this.connection) {
      await this.connection.stop();
      this._connectionState.set('disconnected');
    }
  }

  private registerEventHandlers(): void {
    if (!this.connection) return;

    this.connection.on('UserJoined', (event: UserJoinedEvent) => {
      this.userJoined$.next(event);
    });

    this.connection.on('UserLeft', (event: UserLeftEvent) => {
      this.userLeft$.next(event);
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
  }

  private registerConnectionEvents(): void {
    if (!this.connection) return;

    this.connection.onreconnecting(() => {
      this._connectionState.set('reconnecting');
      console.log('SignalR reconnecting...');
    });

    this.connection.onreconnected(() => {
      this._connectionState.set('connected');
      console.log('SignalR reconnected');
    });

    this.connection.onclose(() => {
      this._connectionState.set('disconnected');
      console.log('SignalR connection closed');
    });
  }

  // Hub methods
  async joinSession(
    sessionCode: string,
    displayName: string,
    isObserver: boolean,
    existingParticipantId?: string
  ): Promise<Participant | null> {
    if (!this.connection) {
      throw new Error('Not connected to SignalR hub');
    }
    return this.connection.invoke<Participant | null>(
      'JoinSession',
      sessionCode,
      displayName,
      isObserver,
      existingParticipantId ?? null
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
}
