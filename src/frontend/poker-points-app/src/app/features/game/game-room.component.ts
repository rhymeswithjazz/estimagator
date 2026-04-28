import {
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
import { DOCUMENT, DecimalPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GameStateService } from '../../core/services/game-state.service';
import { SignalRService } from '../../core/services/signalr.service';
import { AuthService } from '../../core/services/auth.service';
import {
  EmojiThrownEvent,
  Participant,
  POOP_THROW_OPTION,
  Vote,
} from '../../core/models/session.models';
import { SettingsPanelComponent } from './settings-panel.component';
import { StoryHistoryPanelComponent } from './story-history-panel.component';
import { AccountDropdownComponent } from './account-dropdown.component';
import { ThemeSelectorComponent } from '../../shared/components/theme-selector.component';
import { EmojiThrowIconComponent } from './emoji-throw-icon.component';
import { EmojiThrowPaletteComponent } from './emoji-throw-palette.component';
import {
  createEmojiAnimation,
  createEmojiPoopSplat,
  EmojiAnimation,
  EmojiPoopSplat,
  EmojiTargetGeometry,
  EmojiThrowPoint,
  EmojiThrowRect,
  getEmojiAnimationCleanupMs,
  getEmojiAnimationStyle,
  getEmojiImpactDelayMs,
  getEmojiPoopSplatStyle,
  getEmojiStuckDartStyle,
  MAX_ACTIVE_EMOJI_ANIMATIONS,
  MAX_POOP_SPLATS,
  MAX_STUCK_DARTS,
  POOP_SPLAT_LIFETIME_MS,
  STUCK_DART_LIFETIME_MS,
} from './emoji-throw-animation.utils';
import confetti from 'canvas-confetti';

@Component({
  selector: 'app-game-room',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    NgClass,
    RouterLink,
    SettingsPanelComponent,
    StoryHistoryPanelComponent,
    AccountDropdownComponent,
    ThemeSelectorComponent,
    EmojiThrowIconComponent,
    EmojiThrowPaletteComponent,
  ],
  templateUrl: './game-room.component.html',
  host: { class: 'block h-full' },
  styles: [
    `
      .emoji-flight {
        position: fixed;
        z-index: 80;
        pointer-events: none;
        transform: translate(-50%, -50%);
      }

      .emoji-throw-hover-bridge {
        position: absolute;
        left: 50%;
        top: -3.35rem;
        z-index: 29;
        width: 15rem;
        height: 4.25rem;
        pointer-events: auto;
        transform: translateX(-50%);
      }

      .emoji-flight--travel {
        animation: emojiTravel var(--e-duration, 700ms) linear forwards;
      }

      .emoji-flight--pop {
        animation: emojiPopPath 400ms ease-out forwards;
      }

      .emoji-flight-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 2.35rem;
        line-height: 1;
        filter: drop-shadow(0 8px 12px rgb(0 0 0 / 0.28));
        transform-origin: center;
      }

      .emoji-flight--travel .emoji-flight-glyph {
        animation: emojiTravelGlyph var(--e-duration, 700ms) ease-out forwards;
      }

      .emoji-flight--dart .emoji-flight-glyph {
        animation-name: emojiDartGlyph;
      }

      .emoji-flight--dart.emoji-flight--travel {
        animation-name: emojiDartTravel;
        animation-timing-function: cubic-bezier(0.18, 0.86, 0.22, 1);
      }

      .emoji-stuck-dart {
        position: fixed;
        z-index: 70;
        pointer-events: none;
        transform: translate(-50%, -50%);
        animation: emojiDartStickFade 3000ms ease-out forwards;
      }

      .emoji-stuck-dart .emoji-flight-glyph {
        transform: rotate(var(--e-angle));
      }

      .emoji-flight--airplane .emoji-flight-glyph {
        animation-name: emojiAirplaneGlyph;
      }

      .emoji-flight--pop .emoji-flight-glyph {
        animation: emojiPopGlyph 400ms ease-out forwards;
      }

      @keyframes emojiTravelGlyph {
        0% {
          opacity: 0;
          transform: translateY(0) scale(0.7) rotate(-10deg);
        }
        10% {
          opacity: 1;
          transform: translateY(0) scale(0.92) rotate(-6deg);
        }
        48% {
          opacity: 1;
          transform: translateY(0) scale(1.12) rotate(6deg);
        }
        58% {
          opacity: 1;
          transform: translateY(0) scale(1.08) rotate(8deg);
        }
        72% {
          opacity: 1;
          transform: translateY(0) scale(0.9) rotate(10deg);
        }
        82% {
          opacity: 1;
          transform: translateY(0) scale(1.18) rotate(13deg);
        }
        92% {
          opacity: 1;
          transform: translateY(0) scale(0.98) rotate(12deg);
        }
        100% {
          opacity: 0;
          transform: translateY(0) scale(0.86) rotate(12deg);
        }
      }

      @keyframes emojiDartGlyph {
        0% {
          opacity: 0;
          transform: scale(0.72) rotate(var(--e-angle));
        }
        8% {
          opacity: 1;
          transform: scale(1.05) rotate(var(--e-angle));
        }
        72% {
          opacity: 1;
          transform: scale(1.08) rotate(var(--e-angle));
        }
        100% {
          opacity: 1;
          transform: scale(1) rotate(var(--e-angle));
        }
      }

      @keyframes emojiDartStickFade {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.96);
        }
        8% {
          opacity: 0.96;
          transform: translate(-50%, -50%) scale(1);
        }
        84% {
          opacity: 0.96;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.98);
        }
      }

      @keyframes emojiAirplaneGlyph {
        0% {
          opacity: 0;
          transform: translateY(0) rotate(var(--e-angle)) scale(0.72) scaleY(var(--e-flip-y));
        }
        12% {
          opacity: 1;
          transform: translateY(-4px) rotate(var(--e-angle)) scale(0.92) scaleY(var(--e-flip-y));
        }
        34% {
          opacity: 1;
          transform: translateY(5px) rotate(var(--e-angle)) scale(1.04) scaleY(var(--e-flip-y));
        }
        56% {
          opacity: 1;
          transform: translateY(-6px) rotate(var(--e-angle)) scale(1) scaleY(var(--e-flip-y));
        }
        72% {
          opacity: 1;
          transform: translateY(0) rotate(var(--e-angle)) scale(0.94) scaleY(var(--e-flip-y));
        }
        86% {
          opacity: 1;
          transform: translateY(-5px) rotate(var(--e-angle)) scale(1.04) scaleY(var(--e-flip-y));
        }
        100% {
          opacity: 0;
          transform: translateY(2px) rotate(var(--e-angle)) scale(0.86) scaleY(var(--e-flip-y));
        }
      }

      @keyframes emojiPopPath {
        0% {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
        100% {
          opacity: 1;
          transform: translate(-50%, -70%);
        }
      }

      @keyframes emojiPopGlyph {
        0% {
          opacity: 0;
          transform: scale(0.72);
        }
        24% {
          opacity: 1;
          transform: scale(1.14);
        }
        70% {
          opacity: 1;
          transform: scale(1);
        }
        100% {
          opacity: 0;
          transform: scale(0.86);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .emoji-flight--travel {
          animation: emojiPopPath 700ms ease-out forwards;
        }

        .emoji-flight--travel .emoji-flight-glyph {
          animation: emojiPopGlyph 700ms ease-out forwards;
        }
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
  readonly getEmojiAnimationStyle = getEmojiAnimationStyle;
  readonly getEmojiStuckDartStyle = getEmojiStuckDartStyle;
  readonly getEmojiPoopSplatStyle = getEmojiPoopSplatStyle;

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
  readonly openEmojiTargetId = signal<string | null>(null);
  readonly emojiAnimations = signal<EmojiAnimation[]>([]);
  readonly stuckDartAnimations = signal<EmojiAnimation[]>([]);
  readonly poopSplatEffects = signal<EmojiPoopSplat[]>([]);

  // Timer state (delegated to GameStateService)
  readonly timerSecondsRemaining = this.gameState.timerSecondsRemaining;
  readonly timerRunning = this.gameState.timerRunning;
  readonly showTimerExpiredModal = computed(
    () => this.gameState.timerJustExpired() && this.isOrganizer() && !this.allVotersVoted(),
  );

  constructor() {
    // Watch for consensus and trigger confetti
    effect(() => {
      const results = this.votingResults();
      const revealed = this.votesRevealed();
      if (results?.isConsensus && revealed) {
        this.triggerConfetti();
      }
    });

    this.signalR.emojiThrown$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      this.queueEmojiAnimation(event);
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

  showEmojiPalette(participant: Participant): void {
    if (this.canThrowAt(participant)) {
      this.cancelEmojiPaletteClose();
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

  private cancelEmojiPaletteClose(): void {
    if (this.emojiPaletteCloseTimeout) {
      window.clearTimeout(this.emojiPaletteCloseTimeout);
      this.emojiPaletteCloseTimeout = null;
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
    return `left: calc(50% + ${x}px); top: calc(50% + ${y}px); transform: translate(-50%, -50%);`;
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
    return 'bg-white border-2 border-dashed border-gray-300 shadow-sm';
  }

  private queueEmojiAnimation(event: EmojiThrownEvent): void {
    const targetGeometry = this.getParticipantTargetGeometry(event.targetParticipantId);
    if (!targetGeometry) return;

    const reducedMotion =
      this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
    const senderCenter = this.getParticipantCenter(event.senderParticipantId);
    const animation = createEmojiAnimation(event, targetGeometry, senderCenter, reducedMotion);

    this.emojiAnimations.update((animations) =>
      [...animations, animation].slice(-MAX_ACTIVE_EMOJI_ANIMATIONS),
    );

    if (event.emoji === POOP_THROW_OPTION) {
      const impactDelayMs = getEmojiImpactDelayMs(animation);
      window.setTimeout(() => {
        const splat = createEmojiPoopSplat(animation);
        this.poopSplatEffects.update((splats) => [...splats, splat].slice(-MAX_POOP_SPLATS));
        this.emojiAnimations.update((animations) =>
          animations.filter((item) => item.id !== event.throwId),
        );
        window.setTimeout(() => {
          this.poopSplatEffects.update((splats) =>
            splats.filter((item) => item.id !== event.throwId),
          );
        }, POOP_SPLAT_LIFETIME_MS);
      }, impactDelayMs);
      return;
    }

    if (animation.profile === 'dart' && animation.mode === 'travel') {
      window.setTimeout(() => {
        this.stuckDartAnimations.update((animations) =>
          [...animations, animation].slice(-MAX_STUCK_DARTS),
        );
        this.emojiAnimations.update((animations) =>
          animations.filter((item) => item.id !== event.throwId),
        );
        window.setTimeout(() => {
          this.stuckDartAnimations.update((animations) =>
            animations.filter((item) => item.id !== event.throwId),
          );
        }, STUCK_DART_LIFETIME_MS);
      }, animation.durationMs);
      return;
    }

    window.setTimeout(() => {
      this.emojiAnimations.update((animations) =>
        animations.filter((item) => item.id !== event.throwId),
      );
    }, getEmojiAnimationCleanupMs(animation));
  }

  private getParticipantTargetGeometry(participantId: string): EmojiTargetGeometry | null {
    const impactElement = this.document.querySelector<HTMLElement>(
      `[data-emoji-impact-target-id="${participantId}"]`,
    );
    const impactRect = impactElement?.getBoundingClientRect();
    if (impactRect) {
      const surfaceRect = this.toEmojiThrowRect(impactRect);

      return {
        center: {
          x: surfaceRect.left + surfaceRect.width / 2,
          y: surfaceRect.top + surfaceRect.height / 2,
        },
        surfaceRect,
      };
    }

    const center = this.getParticipantCenter(participantId);
    return center ? { center, surfaceRect: null } : null;
  }

  private getParticipantCenter(participantId: string): EmojiThrowPoint | null {
    const element = this.document.querySelector<HTMLElement>(
      `[data-participant-id="${participantId}"]`,
    );
    const rect = element?.getBoundingClientRect();
    if (!rect) return null;

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  private toEmojiThrowRect(rect: DOMRect): EmojiThrowRect {
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
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

  ngOnDestroy(): void {}

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

  formatTime(seconds: number): string {
    return this.gameState.formatTime(seconds);
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
