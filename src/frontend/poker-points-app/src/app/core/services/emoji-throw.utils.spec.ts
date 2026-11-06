import { describe, expect, it } from 'vitest';
import { Participant, SEASONAL_THROW_OPTIONS } from '../models/session.models';
import { canThrowEmojiAt } from './emoji-throw.utils';

const sender = { id: 'sender', isConnected: true } as Participant;
const target = { id: 'target', isConnected: true } as Participant;

describe('canThrowEmojiAt', () => {
  it('allows every seasonal item', () => {
    for (const emoji of Object.values(SEASONAL_THROW_OPTIONS).flat()) {
      expect(canThrowEmojiAt(sender, [sender, target], 'target', emoji)).toBe(true);
    }
  });

  it('rejects items that are not throwable', () => {
    expect(canThrowEmojiAt(sender, [sender, target], 'target', '🧨')).toBe(false);
  });
});
