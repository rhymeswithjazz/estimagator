import { describe, expect, it } from 'vitest';
import { Participant } from '../models/session.models';
import { canThrowEmojiAt } from './emoji-throw.utils';

const sender = { id: 'sender', isConnected: true } as Participant;
const target = { id: 'target', isConnected: true } as Participant;

describe('canThrowEmojiAt', () => {
  it('allows the Halloween items', () => {
    for (const emoji of ['🎃', '🦇', '\u{1F577}\u{FE0F}']) {
      expect(canThrowEmojiAt(sender, [sender, target], 'target', emoji)).toBe(true);
    }
  });

  it('rejects items that are not throwable', () => {
    expect(canThrowEmojiAt(sender, [sender, target], 'target', '🧨')).toBe(false);
  });
});
