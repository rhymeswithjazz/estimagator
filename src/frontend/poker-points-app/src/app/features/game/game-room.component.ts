import { Component, inject, OnInit, OnDestroy, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { SignalRService } from '../../core/services/signalr.service';
import { Participant, Vote } from '../../core/models/session.models';

@Component({
  selector: 'app-game-room',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './game-room.component.html',
})
export class GameRoomComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly gameState = inject(GameStateService);
  private readonly signalR = inject(SignalRService);

  // State from GameStateService
  readonly sessionCode = this.gameState.sessionCode;
  readonly currentParticipant = this.gameState.currentParticipant;
  readonly participants = this.gameState.participants;
  readonly isOrganizer = this.gameState.isOrganizer;
  readonly isObserver = this.gameState.isObserver;
  readonly connectionState = this.signalR.connectionState;
  readonly currentStory = this.gameState.currentStory;
  readonly deckValues = this.gameState.deckValues;
  readonly myVote = this.gameState.myVote;
  readonly canVote = this.gameState.canVote;
  readonly hasVoted = this.gameState.hasVoted;
  readonly votesRevealed = this.gameState.votesRevealed;
  readonly revealedVotes = this.gameState.revealedVotes;
  readonly voteStatuses = this.gameState.voteStatuses;
  readonly voters = this.gameState.voters;
  readonly observers = this.gameState.observers;
  readonly allVotersVoted = this.gameState.allVotersVoted;
  readonly votingResults = this.gameState.votingResults;
  readonly participantVoteMap = this.gameState.participantVoteMap;

  readonly participantCount = computed(() => this.participants().length);
  readonly votedCount = computed(() =>
    this.voters().filter(v => this.participantVoteMap().get(v.id)).length
  );

  // Get vote for a specific participant (after reveal)
  getParticipantVote(participantId: string): Vote | undefined {
    const votes = this.revealedVotes();
    return votes?.find(v => v.participantId === participantId);
  }

  // Check if participant has voted (before reveal)
  hasParticipantVoted(participantId: string): boolean {
    return this.participantVoteMap().get(participantId) ?? false;
  }

  // Calculate position for participant around the table
  getParticipantPosition(index: number, total: number): string {
    // Distribute participants evenly around an ellipse
    // Table dimensions: 600x350, offset for cards (70px from edge)
    const tableWidth = 600;
    const tableHeight = 350;
    const radiusX = tableWidth / 2 + 70;
    const radiusY = tableHeight / 2 + 70;

    // Start from top and go clockwise
    const startAngle = -Math.PI / 2; // Start at top
    const angle = startAngle + (2 * Math.PI * index) / total;

    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;

    // Position relative to center of table, offset to center the card element
    return `left: calc(50% + ${x}px - 28px); top: calc(50% + ${y}px - 40px);`;
  }

  // Get CSS classes for participant's card
  getCardClasses(participant: Participant): string {
    const baseClasses = 'border-2';

    if (this.votesRevealed()) {
      // Card revealed - show actual value with styling
      return `${baseClasses} bg-white text-gray-900 border-gray-300`;
    }

    if (this.hasParticipantVoted(participant.id)) {
      // Has voted - face down card
      return `${baseClasses} bg-blue-800 border-blue-400`;
    }

    // No vote yet
    return `${baseClasses} bg-gray-700/50 border-gray-600 border-dashed`;
  }

  // Get CSS classes for selectable card in deck
  getSelectedCardClasses(cardValue: string): string {
    const isSelected = this.myVote() === cardValue;
    const isDisabled = !this.canVote();

    if (isDisabled) {
      return 'bg-gray-700 text-gray-500 border-gray-600 cursor-not-allowed opacity-50';
    }

    if (isSelected) {
      return 'bg-poker-gold text-poker-green border-yellow-400 -translate-y-2 scale-110 shadow-xl';
    }

    return 'bg-white text-gray-900 border-gray-300 hover:border-poker-gold hover:-translate-y-1 hover:shadow-lg cursor-pointer';
  }

  ngOnInit(): void {
    const code = this.route.snapshot.paramMap.get('code');

    if (!this.gameState.isInSession()) {
      // Not in a session, redirect to join page
      if (code) {
        this.router.navigate(['/join', code]);
      } else {
        this.router.navigate(['/']);
      }
      return;
    }

    // Verify we're in the right session
    if (code && code.toUpperCase() !== this.sessionCode()) {
      this.router.navigate(['/join', code]);
    }
  }

  ngOnDestroy(): void {
    // Cleanup handled by GameStateService if needed
  }

  async leaveGame(): Promise<void> {
    await this.gameState.leaveSession();
    this.router.navigate(['/']);
  }

  async selectCard(value: string): Promise<void> {
    if (!this.canVote()) return;
    await this.gameState.castVote(value);
  }

  async revealVotes(): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.gameState.revealVotes();
  }

  async resetVotes(): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.gameState.resetVotes();
  }
}
