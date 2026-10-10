import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { SignalRService } from '../../core/services/signalr.service';
import { EmojiReactionSentEvent, EmojiThrownEvent } from '../../core/models/session.models';
import { EmojiThrowIconComponent } from './emoji-throw-icon.component';
import {
  createEmojiAnimation,
  EmojiAnimation,
  EmojiImpactSplat,
  EmojiTargetGeometry,
  EmojiThrowPoint,
  EmojiThrowRect,
  getEmojiAnimationCleanupMs,
  getEmojiAnimationStyle,
  createEmojiImpactSplat,
  getEmojiImpactDelayMs,
  getEmojiImpactSplatKind,
  getEmojiImpactSplatStyle,
  getEmojiStuckDartStyle,
  MAX_ACTIVE_EMOJI_ANIMATIONS,
  MAX_EMOJI_SPLATS,
  MAX_STUCK_DARTS,
  EMOJI_SPLAT_LIFETIME_MS,
  STUCK_DART_LIFETIME_MS,
} from './emoji-throw-animation.utils';
import {
  createEmojiReactionAnimation,
  EmojiReactionAnimation,
  getEmojiReactionAnimationStyle,
  getEmojiReactionCleanupMs,
  MAX_ACTIVE_EMOJI_REACTIONS,
} from './emoji-reaction-animation.utils';

@Component({
  selector: 'app-emoji-overlay',
  imports: [EmojiThrowIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (dart of stuckDartAnimations(); track dart.id) {
      <div
        class="emoji-stuck-dart"
        [attr.title]="dart.senderDisplayName"
        [style]="getEmojiStuckDartStyle(dart)"
      >
        <span class="emoji-flight-glyph">
          <app-emoji-throw-icon class="emoji-throw-icon--flight" [emoji]="dart.emoji" />
        </span>
      </div>
    }

    @for (splat of emojiSplatEffects(); track splat.id) {
      <div
        class="emoji-impact-splat"
        [class.emoji-impact-splat--poop]="splat.kind === 'poop'"
        [class.emoji-impact-splat--tomato]="splat.kind === 'tomato'"
        [class.emoji-impact-splat--egg]="splat.kind === 'egg'"
        aria-hidden="true"
        [style]="getEmojiImpactSplatStyle(splat)"
      >
        @if (splat.kind === 'tomato') {
          <img src="tomato-splat.svg" alt="" />
        } @else if (splat.kind === 'egg') {
          <img src="fried-egg-splat.svg" alt="" />
        }
      </div>
    }

    @for (reaction of emojiReactionAnimations(); track reaction.id) {
      <div
        class="emoji-reaction-balloon"
        [attr.title]="reaction.senderDisplayName"
        [style]="getEmojiReactionAnimationStyle(reaction)"
      >
        <span class="emoji-reaction-balloon-glyph">{{ reaction.emoji }}</span>
      </div>
    }

    @for (animation of emojiAnimations(); track animation.id) {
      <div
        class="emoji-flight"
        [class.emoji-flight--travel]="animation.mode === 'travel'"
        [class.emoji-flight--pop]="animation.mode === 'pop'"
        [class.emoji-flight--dart]="animation.profile === 'dart'"
        [class.emoji-flight--airplane]="animation.profile === 'airplane'"
        [class.emoji-flight--rock]="animation.profile === 'rock'"
        [attr.title]="animation.senderDisplayName"
        [style]="getEmojiAnimationStyle(animation)"
      >
        <span class="emoji-flight-glyph">
          <app-emoji-throw-icon class="emoji-throw-icon--flight" [emoji]="animation.emoji" />
        </span>
      </div>
    }
  `,
  styles: [
    `
      .emoji-flight {
        position: fixed;
        z-index: 80;
        pointer-events: none;
        transform: translate(-50%, -50%);
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

      .emoji-reaction-balloon {
        position: fixed;
        z-index: 78;
        pointer-events: none;
        transform: translate(-50%, -50%);
        animation: emojiReactionBalloon var(--r-duration, 3600ms) ease-in-out forwards;
      }

      .emoji-reaction-balloon-glyph {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 2.35rem;
        line-height: 1;
        filter: drop-shadow(0 8px 12px rgb(0 0 0 / 0.28));
      }

      .emoji-flight--airplane .emoji-flight-glyph {
        animation-name: emojiAirplaneGlyph;
      }

      .emoji-flight--rock .emoji-flight-glyph {
        animation-name: emojiRockGlyph;
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

      @keyframes emojiRockGlyph {
        0% {
          opacity: 0;
          transform: scale(0.7) rotate(-24deg);
        }
        10% {
          opacity: 1;
          transform: scale(1) rotate(16deg);
        }
        48% {
          opacity: 1;
          transform: scale(1.08) rotate(168deg);
        }
        72% {
          opacity: 1;
          transform: scale(0.92) rotate(276deg);
        }
        88% {
          opacity: 1;
          transform: scale(1) rotate(342deg);
        }
        100% {
          opacity: 0;
          transform: scale(0.86) rotate(390deg);
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

      @keyframes emojiReactionBalloon {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.76);
        }
        8% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.14);
        }
        16% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        61% {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        100% {
          opacity: 0;
          transform: translate(calc(-50% + var(--r-dx, 0px)), calc(-50% - var(--r-float, 96px)))
            scale(0.94);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .emoji-flight--travel {
          animation: emojiPopPath 700ms ease-out forwards;
        }

        .emoji-flight--travel .emoji-flight-glyph {
          animation: emojiPopGlyph 700ms ease-out forwards;
        }

        .emoji-reaction-balloon {
          animation-timing-function: ease-out;
        }
      }
    `,
  ],
})
export class EmojiOverlayComponent {
  private readonly document = inject(DOCUMENT);
  private readonly signalR = inject(SignalRService);

  readonly emojiAnimations = signal<EmojiAnimation[]>([]);
  readonly emojiReactionAnimations = signal<EmojiReactionAnimation[]>([]);
  readonly stuckDartAnimations = signal<EmojiAnimation[]>([]);
  readonly emojiSplatEffects = signal<EmojiImpactSplat[]>([]);

  readonly getEmojiAnimationStyle = getEmojiAnimationStyle;
  readonly getEmojiStuckDartStyle = getEmojiStuckDartStyle;
  readonly getEmojiImpactSplatStyle = getEmojiImpactSplatStyle;
  readonly getEmojiReactionAnimationStyle = getEmojiReactionAnimationStyle;

  constructor() {
    this.signalR.emojiThrown$.pipe(takeUntilDestroyed()).subscribe((event) => {
      this.queueEmojiAnimation(event);
    });

    this.signalR.emojiReactionSent$.pipe(takeUntilDestroyed()).subscribe((event) => {
      this.queueEmojiReactionAnimation(event);
    });
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

    const splatKind = getEmojiImpactSplatKind(event.emoji);
    if (splatKind) {
      const impactDelayMs = getEmojiImpactDelayMs(animation);
      window.setTimeout(() => {
        const splat = createEmojiImpactSplat(animation, splatKind);
        this.emojiSplatEffects.update((splats) => [...splats, splat].slice(-MAX_EMOJI_SPLATS));
        this.emojiAnimations.update((animations) =>
          animations.filter((item) => item.id !== event.throwId),
        );
        window.setTimeout(() => {
          this.emojiSplatEffects.update((splats) =>
            splats.filter((item) => item.id !== event.throwId),
          );
        }, EMOJI_SPLAT_LIFETIME_MS);
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

  private queueEmojiReactionAnimation(event: EmojiReactionSentEvent): void {
    const anchorCenter = this.getEmojiReactionAnchorCenter(event.senderParticipantId);
    if (!anchorCenter) return;

    const reducedMotion =
      this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ?? false;
    const animation = createEmojiReactionAnimation(event, anchorCenter, reducedMotion);

    this.emojiReactionAnimations.update((animations) =>
      [...animations, animation].slice(-MAX_ACTIVE_EMOJI_REACTIONS),
    );

    window.setTimeout(() => {
      this.emojiReactionAnimations.update((animations) =>
        animations.filter((item) => item.id !== event.reactionId),
      );
    }, getEmojiReactionCleanupMs(animation));
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

  private getEmojiReactionAnchorCenter(participantId: string): EmojiThrowPoint | null {
    const element = this.document.querySelector<HTMLElement>(
      `[data-emoji-reaction-anchor-id="${participantId}"]`,
    );
    const rect = element?.getBoundingClientRect();
    if (!rect) return this.getParticipantCenter(participantId);

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
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
}
