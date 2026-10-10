import { BrandComponent } from '../../shared/components/brand.component';
import { StoryEstimateComponent } from '../jira/story-estimate.component';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  OnDestroy,
  computed,
  signal,
  effect,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT, DecimalPipe, NgClass, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { SignalRService } from '../../core/services/signalr.service';
import { AuthService } from '../../core/services/auth.service';
import { Participant, Vote } from '../../core/models/session.models';
import { SettingsPanelComponent } from './settings-panel.component';
import { StoryHistoryPanelComponent } from './story-history-panel.component';
import { AccountDropdownComponent } from './account-dropdown.component';
import { ThemeSelectorComponent } from '../../shared/components/theme-selector.component';
import { EmojiOverlayComponent } from './emoji-overlay.component';
import { EmojiThrowPaletteComponent } from './emoji-throw-palette.component';
import { EmojiReactionPaletteComponent } from './emoji-reaction-palette.component';
import { TimerCountdownComponent } from './timer-countdown.component';
import confetti from 'canvas-confetti';

@Component({
  selector: 'app-game-room',
  standalone: true,
  imports: [
    BrandComponent,
    StoryEstimateComponent,
    DecimalPipe,
    FormsModule,
    NgClass,
    RouterLink,
    SettingsPanelComponent,
    StoryHistoryPanelComponent,
    AccountDropdownComponent,
    ThemeSelectorComponent,
    NgTemplateOutlet,
    EmojiOverlayComponent,
    EmojiThrowPaletteComponent,
    EmojiReactionPaletteComponent,
    TimerCountdownComponent,
  ],
  templateUrl: './game-room.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  styles: [
    `
      .emoji-throw-hover-bridge {
        position: absolute;
        left: 50%;
        top: -3.75rem;
        z-index: 29;
        width: 26rem;
        max-width: min(26rem, calc(100vw - 2rem));
        height: 9.25rem;
        pointer-events: auto;
        transform: translateX(-50%);
      }
    `,
  ],
})
export class GameRoomComponent implements OnInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private emojiPaletteCloseTimeout: ReturnType<typeof window.setTimeout> | null = null;
  private emojiReactionPaletteCloseTimeout: ReturnType<typeof window.setTimeout> | null = null;
  readonly gameState = inject(GameStateService); // public for debug access
  private readonly signalR = inject(SignalRService);
  readonly authService = inject(AuthService);

  // State from GameStateService
  readonly sessionCode = this.gameState.sessionCode;
  readonly sessionName = this.gameState.sessionName;
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
  readonly votedCount = computed(
    () => this.voters().filter((v) => this.participantVoteMap().get(v.id)).length,
  );
  readonly eligibleHostRecipients = computed(() =>
    this.participants().filter(
      (participant) => participant.isConnected && !participant.isOrganizer,
    ),
  );

  // Dynamic sizing based on voter count
  readonly sizeMode = computed(() => {
    const count = this.voters().length;
    if (count <= 4) return 'large';
    if (count <= 10) return 'normal';
    return 'compact';
  });

  // Backwards compatibility
  readonly compactMode = computed(() => this.sizeMode() === 'compact');

  // Expose Math for template
  readonly Math = Math;

  // Sorted voters: host at top (index 0), current user at bottom (index ~half)
  readonly sortedVoters = computed(() => {
    const voters = [...this.voters()];
    const currentId = this.currentParticipant()?.id;

    if (voters.length <= 1) return voters;

    // Find host and current user
    const hostIndex = voters.findIndex((v) => v.isOrganizer);
    const currentUserIndex = voters.findIndex((v) => v.id === currentId);

    // If no special ordering needed, return as-is
    if (hostIndex === -1 && currentUserIndex === -1) return voters;

    // Build ordered array: host first, then others, current user at bottom position
    const result: typeof voters = [];
    const bottomPosition = Math.floor(voters.length / 2);

    // Get host (or first voter if no host)
    const host = hostIndex !== -1 ? voters[hostIndex] : null;
    // Get current user (if not the host)
    const currentUser =
      currentUserIndex !== -1 && currentUserIndex !== hostIndex ? voters[currentUserIndex] : null;

    // Get all others
    const others = voters.filter((v) => v.id !== host?.id && v.id !== currentUser?.id);

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

    return result.filter((v) => v !== undefined);
  });

  // Story editing state
  readonly isEditingStory = signal(false);
  readonly storyTitleInput = signal('');
  readonly storyUrlInput = signal('');

  // Story queue (used for display in footer)
  readonly storyQueue = this.gameState.storyQueue;

  // Settings panel state
  readonly isSettingsPanelOpen = signal(false);

  // History panel state
  readonly isHistoryPanelOpen = signal(false);
  readonly completedStoryCount = computed(
    () => this.storyQueue().filter((s) => s.status === 'completed').length,
  );

  // Share link state
  readonly shareUrlCopied = signal(false);
  readonly roleChangePending = signal(false);
  readonly showHostLeaveTransferPrompt = signal(false);
  readonly showHostLeaveNoReplacementPrompt = signal(false);
  readonly selectedLeaveTransferTargetId = signal('');
  readonly hostLeaveTransferPending = signal(false);
  readonly hostLeaveError = signal<string | null>(null);
  readonly openEmojiTargetId = signal<string | null>(null);
  readonly openEmojiReactionParticipantId = signal<string | null>(null);

  // Timer state (delegated to GameStateService)
  readonly timerRunning = this.gameState.timerRunning;
  readonly consensusRevealed = computed(
    () => this.votesRevealed() && (this.votingResults()?.isConsensus ?? false),
  );
  readonly showTimerExpiredModal = computed(
    () => this.gameState.timerJustExpired() && this.isOrganizer() && !this.allVotersVoted(),
  );

  constructor() {
    effect(() => {
      if (this.consensusRevealed()) {
        this.triggerConfetti();
      }
    });

    this.signalR.sessionEnded$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.router.navigate(['/']);
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
    return votes?.find((v) => v.participantId === participantId);
  }

  // Check if participant has voted (before reveal)
  hasParticipantVoted(participantId: string): boolean {
    return this.participantVoteMap().get(participantId) ?? false;
  }

  canThrowAt(participant: Participant): boolean {
    return participant.isConnected && participant.id !== this.currentParticipant()?.id;
  }

  canReactFrom(participant: Participant): boolean {
    return participant.isConnected && participant.id === this.currentParticipant()?.id;
  }

  showParticipantEmojiPalette(participant: Participant): void {
    if (this.canReactFrom(participant)) {
      this.showEmojiReactionPalette(participant);
      return;
    }

    this.showEmojiPalette(participant);
  }

  hideParticipantEmojiPalette(): void {
    this.hideEmojiPalette();
    this.hideEmojiReactionPalette();
  }

  showEmojiPalette(participant: Participant): void {
    if (this.canThrowAt(participant)) {
      this.cancelEmojiPaletteClose();
      this.openEmojiReactionParticipantId.set(null);
      this.openEmojiTargetId.set(participant.id);
    }
  }

  hideEmojiPalette(): void {
    this.cancelEmojiPaletteClose();
    this.emojiPaletteCloseTimeout = window.setTimeout(() => {
      this.openEmojiTargetId.set(null);
      this.emojiPaletteCloseTimeout = null;
    }, 140);
  }

  closeEmojiPalette(): void {
    this.cancelEmojiPaletteClose();
    this.openEmojiTargetId.set(null);
  }

  async throwEmoji(targetParticipantId: string, emoji: string): Promise<void> {
    this.cancelEmojiPaletteClose();
    await this.gameState.throwEmoji(targetParticipantId, emoji);
  }

  showEmojiReactionPalette(participant: Participant): void {
    if (this.canReactFrom(participant)) {
      this.cancelEmojiReactionPaletteClose();
      this.openEmojiTargetId.set(null);
      this.openEmojiReactionParticipantId.set(participant.id);
    }
  }

  hideEmojiReactionPalette(): void {
    this.cancelEmojiReactionPaletteClose();
    this.emojiReactionPaletteCloseTimeout = window.setTimeout(() => {
      this.openEmojiReactionParticipantId.set(null);
      this.emojiReactionPaletteCloseTimeout = null;
    }, 140);
  }

  async sendEmojiReaction(emoji: string): Promise<void> {
    this.cancelEmojiReactionPaletteClose();
    this.openEmojiReactionParticipantId.set(null);
    await this.gameState.sendEmojiReaction(emoji);
  }

  private cancelEmojiPaletteClose(): void {
    if (this.emojiPaletteCloseTimeout) {
      window.clearTimeout(this.emojiPaletteCloseTimeout);
      this.emojiPaletteCloseTimeout = null;
    }
  }

  private cancelEmojiReactionPaletteClose(): void {
    if (this.emojiReactionPaletteCloseTimeout) {
      window.clearTimeout(this.emojiReactionPaletteCloseTimeout);
      this.emojiReactionPaletteCloseTimeout = null;
    }
  }

  // Calculate position for participant around the table
  getParticipantPosition(index: number, total: number): string {
    // Distribute participants around the table using a "superellipse" approach
    // Table is 380x200 rounded rectangle, need extra clearance for cards and names
    // Radii vary based on sizeMode: larger cards need less distance, smaller need more
    const mode = this.sizeMode();
    const radiusX = mode === 'large' ? 260 : mode === 'normal' ? 300 : 320;
    const radiusY = mode === 'large' ? 185 : mode === 'normal' ? 215 : 230;

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
      -1 / n,
    );

    const x = cosA * radiusX * superellipseFactor;
    const y = sinA * radiusY * superellipseFactor;

    // Center the element at the calculated position
    return `translate: calc(-50% + ${x}px) calc(-50% + ${y}px);`;
  }

  // Get CSS classes for participant's card
  getCardClasses(participant: Participant): string {
    if (this.votesRevealed()) {
      // Card revealed - show actual value with styling
      return 'bg-white text-gray-800 border-2 border-gray-200 shadow-card';
    }

    if (this.hasParticipantVoted(participant.id)) {
      // Has voted - face down card with red background (card-back overlay adds pattern)
      return 'bg-[#c41e3a] shadow-card';
    }

    // No vote yet - empty card placeholder
    return 'bg-white border-2 border-dashed border-gray-300 shadow-xs';
  }

  // Get CSS classes for selectable card in deck
  getSelectedCardClasses(cardValue: string): string {
    const isSelected = this.myVote() === cardValue;
    const isDisabled = !this.canVote();

    if (isDisabled) {
      return 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed';
    }

    if (isSelected) {
      return 'bg-linear-to-b/srgb from-poker-green-400 to-poker-green-600 text-white border-poker-green-300 shadow-glow-green';
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
    this.cancelEmojiPaletteClose();
    this.cancelEmojiReactionPaletteClose();
    void this.gameState.disconnect();
  }

  async leaveGame(): Promise<void> {
    if (this.isOrganizer()) {
      const eligibleRecipients = this.eligibleHostRecipients();
      if (eligibleRecipients.length > 0) {
        this.selectedLeaveTransferTargetId.set(eligibleRecipients[0].id);
        this.hostLeaveError.set(null);
        this.showHostLeaveTransferPrompt.set(true);
        return;
      }

      this.hostLeaveError.set(null);
      this.showHostLeaveNoReplacementPrompt.set(true);
      return;
    }

    await this.performLeaveGame();
  }

  async confirmTransferHostAndLeave(): Promise<void> {
    if (this.hostLeaveTransferPending()) return;

    const targetId = this.selectedLeaveTransferTargetId();
    if (!targetId) {
      this.hostLeaveError.set('Choose a new host before leaving.');
      return;
    }

    this.hostLeaveTransferPending.set(true);
    this.hostLeaveError.set(null);
    try {
      const transferred = await this.gameState.transferHost(targetId);
      if (!transferred) {
        this.hostLeaveError.set('Unable to transfer host controls.');
        return;
      }

      this.showHostLeaveTransferPrompt.set(false);
      await this.performLeaveGame();
    } catch (err) {
      this.hostLeaveError.set(getTransferErrorMessage(err));
    } finally {
      this.hostLeaveTransferPending.set(false);
    }
  }

  cancelHostLeavePrompt(): void {
    this.showHostLeaveTransferPrompt.set(false);
    this.showHostLeaveNoReplacementPrompt.set(false);
    this.hostLeaveError.set(null);
  }

  async leaveWithoutReplacement(): Promise<void> {
    this.showHostLeaveNoReplacementPrompt.set(false);
    await this.performLeaveGame();
  }

  private async performLeaveGame(): Promise<void> {
    await this.gameState.leaveSession();
    this.router.navigate(['/']);
  }

  async selectCard(value: string): Promise<void> {
    if (!this.canVote()) return;
    await this.gameState.castVote(value);
  }

  async toggleObserverMode(): Promise<void> {
    if (this.roleChangePending()) return;

    this.roleChangePending.set(true);
    try {
      await this.gameState.switchRole(!this.isObserver());
    } finally {
      this.roleChangePending.set(false);
    }
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
    const story = this.currentStory();
    this.storyTitleInput.set(story?.title ?? '');
    this.storyUrlInput.set(story?.url ?? '');
    this.isEditingStory.set(true);
  }

  async saveStoryTitle(): Promise<void> {
    if (!this.isOrganizer()) return;
    const title = this.storyTitleInput().trim();
    const url = this.storyUrlInput().trim() || null;
    const storyId = this.currentStory()?.id;

    if (!title) {
      this.isEditingStory.set(false);
      return;
    }

    if (storyId) {
      // Update existing story
      await this.gameState.updateStoryDetails(storyId, title, url);
    } else {
      // No active story - create a new one via nextStory
      await this.gameState.nextStory(title);
      // If there's a URL, update the newly created story
      if (url) {
        // Small delay to ensure story is created, then update with URL
        await new Promise((resolve) => setTimeout(resolve, 100));
        const newStoryId = this.currentStory()?.id;
        if (newStoryId) {
          await this.gameState.updateStoryDetails(newStoryId, title, url);
        }
      }
    }
    this.isEditingStory.set(false);
  }

  cancelEditingStory(): void {
    this.isEditingStory.set(false);
    this.storyTitleInput.set('');
    this.storyUrlInput.set('');
  }

  async nextStory(): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.gameState.nextStory();
  }

  async startTimer(): Promise<void> {
    if (!this.isOrganizer() || this.votesRevealed()) return;
    await this.gameState.startTimer();
  }

  async stopTimer(): Promise<void> {
    if (!this.isOrganizer()) return;
    await this.gameState.stopTimer();
  }

  async extendTimer(seconds: number): Promise<void> {
    if (!this.isOrganizer() || !this.timerRunning()) return;
    await this.gameState.extendTimer(seconds);
  }

  dismissTimerExpired(): void {
    this.gameState.dismissTimerExpired();
  }

  async revealFromTimerExpired(): Promise<void> {
    this.gameState.dismissTimerExpired();
    await this.revealVotes();
  }

  // Settings panel methods
  toggleSettingsPanel(): void {
    this.isSettingsPanelOpen.update((open) => !open);
  }

  // History panel methods
  toggleHistoryPanel(): void {
    this.isHistoryPanelOpen.update((open) => !open);
  }

  // Share link methods
  async copyShareUrl(): Promise<void> {
    const code = this.sessionCode();
    if (!code) return;

    const shareUrl = `${this.document.location.origin}/join/${code}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      this.shareUrlCopied.set(true);
      setTimeout(() => this.shareUrlCopied.set(false), 1500);
    } catch {
      // Fallback for older browsers
      const textArea = this.document.createElement('textarea');
      textArea.value = shareUrl;
      this.document.body.appendChild(textArea);
      textArea.select();
      this.document.execCommand('copy');
      this.document.body.removeChild(textArea);
      this.shareUrlCopied.set(true);
      setTimeout(() => this.shareUrlCopied.set(false), 1500);
    }
  }
}

function getTransferErrorMessage(err: unknown): string {
  const fallback = 'Unable to transfer host controls.';
  if (!(err instanceof Error) || !err.message) return fallback;

  const message = err.message;
  if (message.includes('Method does not exist')) {
    return 'Host transfer is unavailable. Refresh and try again.';
  }

  const hubExceptionMessage = message.match(/HubException:\s*(.+)$/)?.[1];
  return hubExceptionMessage || message;
}
