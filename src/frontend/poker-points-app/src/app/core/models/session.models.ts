export interface CreateSessionRequest {
  deckType?: string;
  name?: string;
  timerDurationSeconds?: number;
}

export interface CreateSessionResponse {
  sessionId: string;
  accessCode: string;
  name: string | null;
  timerDurationSeconds: number;
}

export interface SessionInfo {
  id: string;
  accessCode: string;
  name: string | null;
  deckType: string;
  timerDurationSeconds: number;
  isActive: boolean;
  createdAt: string;
  participants: Participant[];
  currentStory: Story | null;
}

export interface UserSession extends SessionInfo {
  isOrganizer: boolean;
}

export interface Participant {
  id: string;
  displayName: string;
  isObserver: boolean;
  isOrganizer: boolean;
  isConnected: boolean;
}

export interface Story {
  id: string;
  title: string;
  url: string | null;
  status: 'pending' | 'active' | 'completed';
  finalScore: number | null;
}

export interface Vote {
  participantId: string;
  displayName: string;
  cardValue: string | null;
}

export interface VoteStatus {
  participantId: string;
  hasVoted: boolean;
}

export interface GameState {
  session: SessionInfo;
  currentStory: Story | null;
  participants: Participant[];
  voteStatuses: VoteStatus[];
  revealedVotes: Vote[] | null;
  activeTimer: TimerState | null;
}

export interface TimerState {
  endTimeUtc: string;
  durationSeconds: number;
}

export interface TimerStartedEvent {
  endTimeUtc: string;
  durationSeconds: number;
}

export interface TimerExtendedEvent {
  endTimeUtc: string;
}

// Hub event payloads
export interface UserJoinedEvent {
  participant: Participant;
}

export interface UserLeftEvent {
  participantId: string;
}

export interface VoteCastEvent {
  participantId: string;
}

export interface VotesRevealedEvent {
  votes: Vote[];
  average: number | null;
  isConsensus: boolean;
}

export interface VotesResetEvent {
  storyId: string | null;
}

export interface StoryUpdatedEvent {
  story: Story;
}

export interface EmojiThrownEvent {
  throwId: string;
  senderParticipantId: string;
  senderDisplayName: string;
  targetParticipantId: string;
  emoji: string;
  sentAtUtc: string;
}

export const DART_THROW_OPTION = '🎯';
export const AIRPLANE_THROW_OPTION = '✈️';
export const PAPER_BALL_THROW_OPTION = 'paper-ball';
export const POOP_THROW_OPTION = '💩';
export const EMOJI_THROW_OPTIONS = [
  DART_THROW_OPTION,
  AIRPLANE_THROW_OPTION,
  PAPER_BALL_THROW_OPTION,
  '❤️',
  POOP_THROW_OPTION,
] as const;
export type EmojiThrowOption = (typeof EMOJI_THROW_OPTIONS)[number];
export type EmojiThrowProfile = 'dart' | 'airplane' | 'default';
export type EmojiThrowIconKind = 'dart' | 'airplane' | 'paper-ball' | 'emoji';

export interface EmojiThrowOptionMetadata {
  value: EmojiThrowOption;
  label: string;
  iconKind: EmojiThrowIconKind;
  profile: EmojiThrowProfile;
}

export const EMOJI_THROW_OPTION_METADATA: Record<EmojiThrowOption, EmojiThrowOptionMetadata> = {
  [DART_THROW_OPTION]: {
    value: DART_THROW_OPTION,
    label: 'dart',
    iconKind: 'dart',
    profile: 'dart',
  },
  [AIRPLANE_THROW_OPTION]: {
    value: AIRPLANE_THROW_OPTION,
    label: 'paper airplane',
    iconKind: 'airplane',
    profile: 'airplane',
  },
  [PAPER_BALL_THROW_OPTION]: {
    value: PAPER_BALL_THROW_OPTION,
    label: 'paper ball',
    iconKind: 'paper-ball',
    profile: 'default',
  },
  '❤️': {
    value: '❤️',
    label: 'heart',
    iconKind: 'emoji',
    profile: 'default',
  },
  [POOP_THROW_OPTION]: {
    value: POOP_THROW_OPTION,
    label: 'poop',
    iconKind: 'emoji',
    profile: 'default',
  },
};

export function getEmojiThrowOptionMetadata(emoji: string): EmojiThrowOptionMetadata | undefined {
  return EMOJI_THROW_OPTION_METADATA[emoji as EmojiThrowOption];
}

// Deck configurations
export type DeckType = 'fibonacci' | 'modified' | 'powers' | 'linear' | 'tshirt';

export const DECK_VALUES: Record<DeckType, string[]> = {
  fibonacci: ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'],
  modified: ['0', '½', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '☕'],
  powers: ['1', '2', '4', '8', '16', '32', '64', '?', '☕'],
  linear: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '?', '☕'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕'],
};

// Session history types
export interface SessionHistoryResponse {
  id: string;
  accessCode: string;
  name: string | null;
  deckType: string;
  isActive: boolean;
  createdAt: string;
  participants: Participant[];
  stories: StoryHistory[];
}

export interface StoryHistory {
  id: string;
  title: string;
  url: string | null;
  status: 'pending' | 'active' | 'completed';
  finalScore: number | null;
  votes: Vote[];
}
