import { EMOJI_REACTION_OPTIONS, EMOJI_THROW_OPTIONS, Participant } from '../models/session.models';

export function canThrowEmojiAt(
  currentParticipant: Participant | null,
  participants: Participant[],
  targetParticipantId: string,
  emoji: string,
): boolean {
  if (!EMOJI_THROW_OPTIONS.includes(emoji as (typeof EMOJI_THROW_OPTIONS)[number])) return false;
  if (!currentParticipant || targetParticipantId === currentParticipant.id) return false;

  const target = participants.find((p) => p.id === targetParticipantId);
  return target?.isConnected ?? false;
}

export function canSendEmojiReaction(
  currentParticipant: Participant | null,
  emoji: string,
): boolean {
  if (!EMOJI_REACTION_OPTIONS.includes(emoji as (typeof EMOJI_REACTION_OPTIONS)[number])) {
    return false;
  }

  return currentParticipant?.isConnected ?? false;
}
