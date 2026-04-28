import { describe, expect, it } from 'vitest';
import { Participant } from '../models/session.models';
import { canThrowEmojiAt } from './emoji-throw.utils';

describe('canThrowEmojiAt', () => {
  const currentParticipant: Participant = {
    id: 'sender-id',
    displayName: 'Sender',
    isObserver: false,
    isOrganizer: false,
    isConnected: true,
  };

  const targetParticipant: Participant = {
    id: 'target-id',
    displayName: 'Target',
    isObserver: false,
    isOrganizer: false,
    isConnected: true,
  };

  const disconnectedParticipant: Participant = {
    id: 'disconnected-id',
    displayName: 'Disconnected',
    isObserver: false,
    isOrganizer: false,
    isConnected: false,
  };

  const participants = [currentParticipant, targetParticipant, disconnectedParticipant];

  it('allows a preset emoji to be thrown at a connected target', () => {
    expect(canThrowEmojiAt(currentParticipant, participants, targetParticipant.id, '🎯')).toBe(
      true,
    );
  });

  it('allows the airplane throw option', () => {
    expect(canThrowEmojiAt(currentParticipant, participants, targetParticipant.id, '✈️')).toBe(
      true,
    );
  });

  it('allows the custom paper ball throw option', () => {
    expect(
      canThrowEmojiAt(currentParticipant, participants, targetParticipant.id, 'paper-ball'),
    ).toBe(true);
  });

  it('allows the poop emoji throw option', () => {
    expect(canThrowEmojiAt(currentParticipant, participants, targetParticipant.id, '💩')).toBe(
      true,
    );
  });

  it('does not allow throwing at the current participant', () => {
    expect(canThrowEmojiAt(currentParticipant, participants, currentParticipant.id, '🎯')).toBe(
      false,
    );
  });

  it('does not allow unavailable emoji', () => {
    expect(canThrowEmojiAt(currentParticipant, participants, targetParticipant.id, '🧨')).toBe(
      false,
    );
  });

  it('does not allow throwing at disconnected users', () => {
    expect(
      canThrowEmojiAt(currentParticipant, participants, disconnectedParticipant.id, '🎯'),
    ).toBe(false);
  });
});
