import { EmojiReactionSentEvent } from '../../core/models/session.models';

export const MAX_ACTIVE_EMOJI_REACTIONS = 20;
export const EMOJI_REACTION_HOLD_MS = 2200;
export const EMOJI_REACTION_FLOAT_MS = 1400;
export const EMOJI_REACTION_CLEANUP_MS = EMOJI_REACTION_HOLD_MS + EMOJI_REACTION_FLOAT_MS;

export interface EmojiReactionPoint {
  x: number;
  y: number;
}

export interface EmojiReactionAnimation {
  id: string;
  emoji: string;
  senderDisplayName: string;
  x: number;
  y: number;
  driftX: number;
  floatY: number;
  durationMs: number;
}

export function createEmojiReactionAnimation(
  event: EmojiReactionSentEvent,
  anchorCenter: EmojiReactionPoint,
  reducedMotion: boolean,
  random: () => number = Math.random,
): EmojiReactionAnimation {
  return {
    id: event.reactionId,
    emoji: event.emoji,
    senderDisplayName: event.senderDisplayName,
    x: anchorCenter.x,
    y: anchorCenter.y,
    driftX: reducedMotion ? 0 : (random() - 0.5) * 34,
    floatY: reducedMotion ? 0 : 86 + random() * 26,
    durationMs: EMOJI_REACTION_CLEANUP_MS,
  };
}

export function getEmojiReactionAnimationStyle(animation: EmojiReactionAnimation): string {
  return [
    `left: ${animation.x}px`,
    `top: ${animation.y}px`,
    `--r-dx: ${animation.driftX}px`,
    `--r-float: ${animation.floatY}px`,
    `--r-duration: ${animation.durationMs}ms`,
  ].join('; ');
}

export function getEmojiReactionCleanupMs(animation: EmojiReactionAnimation): number {
  return animation.durationMs;
}
