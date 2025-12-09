import { Component, inject, OnInit, OnDestroy, computed, signal, effect } from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { SignalRService } from '../../core/services/signalr.service';
import { Participant, Vote } from '../../core/models/session.models';
import confetti from 'canvas-confetti';

@Component({
  selector: 'app-game-room',
  standalone: true,
  imports: [DecimalPipe, FormsModule, NgClass, RouterLink],
  templateUrl: './game-room.component.html',
  host: { class: 'block h-full' },
})
export class GameRoomComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly gameState = inject(GameStateService); // public for debug access
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
  readonly voteDistribution = this.gameState.voteDistribution;

  readonly participantCount = computed(() => this.participants().length);
  readonly votedCount = computed(() =>
    this.voters().filter(v => this.participantVoteMap().get(v.id)).length
  );

  // Use compact sizing when more than 10 voters
  readonly compactMode = computed(() => this.voters().length > 10);

  // Expose Math for template
  readonly Math = Math;

  // Sorted voters: host at top (index 0), current user at bottom (index ~half)
  readonly sortedVoters = computed(() => {
    const voters = [...this.voters()];
    const currentId = this.currentParticipant()?.id;

    if (voters.length <= 1) return voters;

    // Find host and current user
    const hostIndex = voters.findIndex(v => v.isOrganizer);
    const currentUserIndex = voters.findIndex(v => v.id === currentId);

    // If no special ordering needed, return as-is
    if (hostIndex === -1 && currentUserIndex === -1) return voters;

    // Build ordered array: host first, then others, current user at bottom position
    const result: typeof voters = [];
    const bottomPosition = Math.floor(voters.length / 2);

    // Get host (or first voter if no host)
    const host = hostIndex !== -1 ? voters[hostIndex] : null;
    // Get current user (if not the host)
    const currentUser = currentUserIndex !== -1 && currentUserIndex !== hostIndex
      ? voters[currentUserIndex]
      : null;

    // Get all others
    const others = voters.filter(v =>
      v.id !== host?.id && v.id !== currentUser?.id
    );

    // Place host at position 0 (top)
    if (host) {
      result[0] = host;
    }

    // Place current user at bottom position
    if (currentUser) {
      result[bottomPosition] = currentUser;
    }

    // Fill in others in remaining positions
    let otherIndex = 0;
    for (let i = 0; i < voters.length; i++) {
      if (result[i] === undefined && otherIndex < others.length) {
        result[i] = others[otherIndex++];
      }
    }

    // Handle edge case: if current user IS the host, they stay at top
    if (host && currentUser === null && currentId === host.id) {
      // Current user is host, already at top - that's fine
    }

    return result.filter(v => v !== undefined);
  });

  // Story editing state
  readonly isEditingStory = signal(false);
  readonly storyTitleInput = signal('');

  // Story management state
  readonly storyQueue = this.gameState.storyQueue;
  readonly isStoryPanelOpen = signal(false);
  readonly isAddingStories = signal(false);
  readonly newStoriesText = signal(''); // textarea for batch input
  readonly newStoryTitle = signal('');
  readonly newStoryUrl = signal('');

  // Timer state
  readonly timerSeconds = signal<number | null>(null);
  readonly timerRunning = signal(false);
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Watch for consensus and trigger confetti
    effect(() => {
      const results = this.votingResults();
      const revealed = this.votesRevealed();
      if (results?.isConsensus && revealed) {
        this.triggerConfetti();
      }
    });
  }

  private triggerConfetti(): void {
    const duration = 3000;
    const end = Date.now() + duration;

    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    // Initial burst from center
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors,
    });

    frame();
  }

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
    // Distribute participants around the table using a "superellipse" approach
    // Table is 380x200 rounded rectangle, need extra clearance for cards (~60px) and names (~50px)
    // Card+name element is ~110px tall (72px card + gap + name + badge)
    const radiusX = 300; // Horizontal distance from center
    const radiusY = 215; // Vertical distance from center

    // Start from top and go clockwise
    const startAngle = -Math.PI / 2; // Start at top
    const angle = startAngle + (2 * Math.PI * index) / total;

    // Use superellipse (n=3) for better fit around rounded rectangle
    // This pushes side positions outward more than a regular ellipse
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const n = 3;
    const superellipseFactor = Math.pow(
      Math.pow(Math.abs(cosA), n) + Math.pow(Math.abs(sinA), n),
      -1 / n
    );

    const x = cosA * radiusX * superellipseFactor;
    const y = sinA * radiusY * superellipseFactor;

    // Center the element at the calculated position
    return `left: calc(50% + ${x}px); top: calc(50% + ${y}px); transform: translate(-50%, -50%);`;
  }

  // Get CSS classes for participant's card
  getCardClasses(participant: Participant): string {
    if (this.votesRevealed()) {
      // Card revealed - show actual value with styling
      return 'bg-white text-gray-800 border-2 border-gray-200 shadow-card';
    }

    if (this.hasParticipantVoted(participant.id)) {
      // Has voted - face down card (styling handled by card-back class in template)
      return 'shadow-card';
    }

    // No vote yet - empty card placeholder
    return 'bg-white border-2 border-dashed border-gray-300 shadow-sm';
  }

  // Get CSS classes for selectable card in deck
  getSelectedCardClasses(cardValue: string): string {
    const isSelected = this.myVote() === cardValue;
    const isDisabled = !this.canVote();

    if (isDisabled) {
      return 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed';
    }

    if (isSelected) {
      return 'bg-gradient-to-b from-poker-green-400 to-poker-green-600 text-white border-poker-green-300 shadow-glow-green';
    }

    return 'bg-white text-gray-800 border-gray-200 hover:border-poker-green-400 hover:shadow-card-hover cursor-pointer';
  }

  async ngOnInit(): Promise<void> {
    const code = this.route.snapshot.paramMap.get('code');

    if (!code) {
      this.router.navigate(['/']);
      return;
    }

    if (!this.gameState.isInSession()) {
      // Try to reconnect using stored session identity
      const reconnected = await this.gameState.attemptReconnect(code);

      if (!reconnected) {
        // Not in a session and couldn't reconnect, redirect to join page
        this.router.navigate(['/join', code]);
        return;
      }
    }

    // Verify we're in the right session
    if (code.toUpperCase() !== this.sessionCode()) {
      this.router.navigate(['/join', code]);
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
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

  startEditingStory(): void {
    if (!this.isOrganizer()) return;
    this.storyTitleInput.set(this.currentStory()?.title ?? '');
    this.isEditingStory.set(true);
  }

  async saveStoryTitle(): Promise<void> {
    if (!this.isOrganizer()) return;
    const title = this.storyTitleInput().trim();
    if (title) {
      await this.gameState.updateStory(title);
    }
    this.isEditingStory.set(false);
  }

  cancelEditingStory(): void {
    this.isEditingStory.set(false);
    this.storyTitleInput.set('');
  }

  async nextStory(): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.gameState.nextStory();
  }

  startTimer(seconds: number = 60): void {
    if (!this.isOrganizer() || this.votesRevealed()) return;

    this.stopTimer();
    this.timerSeconds.set(seconds);
    this.timerRunning.set(true);

    this.timerInterval = setInterval(() => {
      const current = this.timerSeconds();
      if (current === null || current <= 1) {
        this.stopTimer();
        // Auto-reveal when timer expires
        if (!this.votesRevealed()) {
          this.revealVotes();
        }
      } else {
        this.timerSeconds.set(current - 1);
      }
    }, 1000);
  }

  stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerRunning.set(false);
    this.timerSeconds.set(null);
  }

  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Story management methods
  toggleStoryPanel(): void {
    this.isStoryPanelOpen.update(open => !open);
  }

  openAddStories(): void {
    this.isAddingStories.set(true);
    this.newStoriesText.set('');
    this.newStoryTitle.set('');
    this.newStoryUrl.set('');
  }

  cancelAddStories(): void {
    this.isAddingStories.set(false);
    this.newStoriesText.set('');
    this.newStoryTitle.set('');
    this.newStoryUrl.set('');
  }

  async addSingleStory(): Promise<void> {
    const title = this.newStoryTitle().trim();
    if (!title) return;

    const url = this.newStoryUrl().trim() || undefined;
    await this.gameState.addStories([{ title, url }]);

    this.newStoryTitle.set('');
    this.newStoryUrl.set('');
  }

  async addBatchStories(): Promise<void> {
    const text = this.newStoriesText().trim();
    if (!text) return;

    // Parse lines - each line is a story, optionally with URL after tab or |
    const stories = text.split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => {
        // Support formats: "Title" or "Title	URL" or "Title | URL"
        const tabSplit = line.split('\t');
        const pipeSplit = line.split(' | ');

        if (tabSplit.length > 1) {
          return { title: tabSplit[0].trim(), url: tabSplit[1].trim() || undefined };
        } else if (pipeSplit.length > 1) {
          return { title: pipeSplit[0].trim(), url: pipeSplit[1].trim() || undefined };
        }
        return { title: line };
      });

    if (stories.length > 0) {
      await this.gameState.addStories(stories);
      this.isAddingStories.set(false);
      this.newStoriesText.set('');
    }
  }

  async deleteStoryFromQueue(storyId: string): Promise<void> {
    await this.gameState.deleteStory(storyId);
  }

  async startStoryFromQueue(storyId: string): Promise<void> {
    await this.gameState.startStory(storyId);
  }

  async restartStoryFromQueue(storyId: string): Promise<void> {
    await this.gameState.restartStory(storyId);
  }
}
