import { describe, expect, it } from 'vitest';
import { EmojiReactionSentEvent } from '../../core/models/session.models';
import {
  createEmojiReactionAnimation,
  EMOJI_REACTION_CLEANUP_MS,
  EMOJI_REACTION_FLOAT_MS,
  EMOJI_REACTION_HOLD_MS,
  getEmojiReactionAnimationStyle,
  getEmojiReactionCleanupMs,
} from './emoji-reaction-animation.utils';

describe('emoji reaction animation utils', () => {
  const event: EmojiReactionSentEvent = {
    reactionId: 'reaction-id',
    senderParticipantId: 'sender-id',
    senderDisplayName: 'Sender',
    emoji: '👍',
    sentAtUtc: '2026-04-30T00:00:00Z',
  };

  it('creates a balloon reaction with hold plus float timing', () => {
    const animation = createEmojiReactionAnimation(event, { x: 120, y: 180 }, false, () => 0.5);

    expect(animation.id).toBe('reaction-id');
    expect(animation.emoji).toBe('👍');
    expect(animation.x).toBe(120);
    expect(animation.y).toBe(180);
    expect(animation.driftX).toBe(0);
    expect(animation.floatY).toBe(99);
    expect(animation.durationMs).toBe(EMOJI_REACTION_HOLD_MS + EMOJI_REACTION_FLOAT_MS);
    expect(getEmojiReactionCleanupMs(animation)).toBe(EMOJI_REACTION_CLEANUP_MS);
  });

  it('generates fixed-position animation style values', () => {
    const animation = createEmojiReactionAnimation(event, { x: 90, y: 140 }, false, () => 1);

    expect(getEmojiReactionAnimationStyle(animation)).toContain('left: 90px');
    expect(getEmojiReactionAnimationStyle(animation)).toContain('top: 140px');
    expect(getEmojiReactionAnimationStyle(animation)).toContain('--r-dx: 17px');
    expect(getEmojiReactionAnimationStyle(animation)).toContain('--r-float: 112px');
    expect(getEmojiReactionAnimationStyle(animation)).toContain('--r-duration: 3600ms');
  });

  it('keeps reduced-motion reactions anchored while they fade', () => {
    const animation = createEmojiReactionAnimation(event, { x: 90, y: 140 }, true, () => 1);

    expect(animation.driftX).toBe(0);
    expect(animation.floatY).toBe(0);
  });
});
