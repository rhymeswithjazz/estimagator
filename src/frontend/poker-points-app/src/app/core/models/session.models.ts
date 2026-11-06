import type { JiraLink } from '../services/jira.service';
import type { Season } from './season.models';
export interface CreateSessionRequest {
  deckType?: string;
  name?: string;
  timerDurationSeconds?: number;
  cardBack?: CardBack;
}

export interface CreateSessionResponse {
  sessionId: string;
  accessCode: string;
  name: string | null;
  timerDurationSeconds: number;
  guestHostToken: string | null;
}

export interface SessionInfo {
  id: string;
  accessCode: string;
  name: string | null;
  deckType: string;
  timerDurationSeconds: number;
  cardBack: string;
  isActive: boolean;
  createdAt: string;
  participants: Participant[];
  currentStory: Story | null;
}

export interface UserSession extends SessionInfo {
  isOrganizer: boolean;
}

export interface JoinSessionResponse {
  participant: Participant;
  reconnectToken: string | null;
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
  agreedEstimate?: number | null;
  estimateRevision?: number;
  jira?: JiraLink | null;
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
  votingResults?: { average: number | null; isConsensus: boolean } | null;
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

export interface HostTransferredEvent {
  previousHostParticipantId: string;
  newHost: Participant;
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

export interface EmojiReactionSentEvent {
  reactionId: string;
  senderParticipantId: string;
  senderDisplayName: string;
  emoji: string;
  sentAtUtc: string;
}

export const DART_THROW_OPTION = '🎯';
export const AIRPLANE_THROW_OPTION = '✈️';
export const PAPER_BALL_THROW_OPTION = 'paper-ball';
export const POOP_THROW_OPTION = '💩';
export const TOMATO_THROW_OPTION = '🍅';
export const ROCK_THROW_OPTION = '🪨';
export const EGG_THROW_OPTION = '🥚';
export const PUMPKIN_THROW_OPTION = '🎃';
export const BAT_THROW_OPTION = '🦇';
export const SPIDER_THROW_OPTION = '\u{1F577}\u{FE0F}';
export const TURKEY_THROW_OPTION = '🦃';
export const PIE_THROW_OPTION = '🥧';
export const CORN_THROW_OPTION = '🌽';
export const SNOWBALL_THROW_OPTION = '\u{2744}\u{FE0F}';
export const GIFT_THROW_OPTION = '🎁';
export const COOKIE_THROW_OPTION = '🍪';
export const EMOJI_THROW_OPTIONS = [
  DART_THROW_OPTION,
  AIRPLANE_THROW_OPTION,
  PAPER_BALL_THROW_OPTION,
  '❤️',
  POOP_THROW_OPTION,
  TOMATO_THROW_OPTION,
  ROCK_THROW_OPTION,
  EGG_THROW_OPTION,
] as const;
export const SEASONAL_THROW_OPTIONS = {
  halloween: [PUMPKIN_THROW_OPTION, BAT_THROW_OPTION, SPIDER_THROW_OPTION],
  thanksgiving: [TURKEY_THROW_OPTION, PIE_THROW_OPTION, CORN_THROW_OPTION],
  christmas: [SNOWBALL_THROW_OPTION, GIFT_THROW_OPTION, COOKIE_THROW_OPTION],
} as const satisfies Record<Season, readonly string[]>;
export type EmojiThrowOption =
  (typeof EMOJI_THROW_OPTIONS)[number] | (typeof SEASONAL_THROW_OPTIONS)[Season][number];
export type EmojiThrowProfile = 'dart' | 'airplane' | 'rock' | 'default';
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
  [TOMATO_THROW_OPTION]: {
    value: TOMATO_THROW_OPTION,
    label: 'tomato',
    iconKind: 'emoji',
    profile: 'default',
  },
  [ROCK_THROW_OPTION]: {
    value: ROCK_THROW_OPTION,
    label: 'rock',
    iconKind: 'emoji',
    profile: 'rock',
  },
  [EGG_THROW_OPTION]: {
    value: EGG_THROW_OPTION,
    label: 'egg',
    iconKind: 'emoji',
    profile: 'default',
  },
  [PUMPKIN_THROW_OPTION]: {
    value: PUMPKIN_THROW_OPTION,
    label: 'pumpkin',
    iconKind: 'emoji',
    profile: 'rock',
  },
  [BAT_THROW_OPTION]: {
    value: BAT_THROW_OPTION,
    label: 'bat',
    iconKind: 'emoji',
    profile: 'default',
  },
  [SPIDER_THROW_OPTION]: {
    value: SPIDER_THROW_OPTION,
    label: 'spider',
    iconKind: 'emoji',
    profile: 'default',
  },
  [TURKEY_THROW_OPTION]: {
    value: TURKEY_THROW_OPTION,
    label: 'turkey',
    iconKind: 'emoji',
    profile: 'rock',
  },
  [PIE_THROW_OPTION]: {
    value: PIE_THROW_OPTION,
    label: 'pie',
    iconKind: 'emoji',
    profile: 'default',
  },
  [CORN_THROW_OPTION]: {
    value: CORN_THROW_OPTION,
    label: 'corn',
    iconKind: 'emoji',
    profile: 'default',
  },
  [SNOWBALL_THROW_OPTION]: {
    value: SNOWBALL_THROW_OPTION,
    label: 'snowball',
    iconKind: 'emoji',
    profile: 'default',
  },
  [GIFT_THROW_OPTION]: {
    value: GIFT_THROW_OPTION,
    label: 'gift',
    iconKind: 'emoji',
    profile: 'rock',
  },
  [COOKIE_THROW_OPTION]: {
    value: COOKIE_THROW_OPTION,
    label: 'cookie',
    iconKind: 'emoji',
    profile: 'default',
  },
};

export function getEmojiThrowOptionMetadata(emoji: string): EmojiThrowOptionMetadata | undefined {
  return EMOJI_THROW_OPTION_METADATA[emoji as EmojiThrowOption];
}

export const EMOJI_REACTION_OPTIONS = ['❤️', '👍', '💯', '🎉', '👏', '🔥', '👀', '☕'] as const;
export type EmojiReactionOption = (typeof EMOJI_REACTION_OPTIONS)[number];

export interface EmojiReactionOptionMetadata {
  value: EmojiReactionOption;
  label: string;
}

export const EMOJI_REACTION_OPTION_METADATA: Record<
  EmojiReactionOption,
  EmojiReactionOptionMetadata
> = {
  '❤️': {
    value: '❤️',
    label: 'heart',
  },
  '👍': {
    value: '👍',
    label: 'thumbs up',
  },
  '💯': {
    value: '💯',
    label: 'one hundred',
  },
  '🎉': {
    value: '🎉',
    label: 'party',
  },
  '👏': {
    value: '👏',
    label: 'clap',
  },
  '🔥': {
    value: '🔥',
    label: 'fire',
  },
  '👀': {
    value: '👀',
    label: 'eyes',
  },
  '☕': {
    value: '☕',
    label: 'coffee',
  },
};

export function getEmojiReactionOptionMetadata(
  emoji: string,
): EmojiReactionOptionMetadata | undefined {
  return EMOJI_REACTION_OPTION_METADATA[emoji as EmojiReactionOption];
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

export const CARD_BACKS = [
  { id: 'classic-red', label: 'Classic Red' },
  { id: 'classic-blue', label: 'Classic Blue' },
  { id: 'midnight-neon', label: 'Midnight Neon' },
  { id: 'art-deco', label: 'Art Deco' },
  { id: 'retro-sunset', label: 'Retro Sunset' },
  { id: 'scout-night', label: 'Scout Night' },
  { id: 'scout-deco', label: 'Scout Deco' },
] as const;

export type CardBack = (typeof CARD_BACKS)[number]['id'];

export const DEFAULT_CARD_BACK: CardBack = 'classic-red';

export const SEASONAL_CARD_BACKS = {
  halloween: 'jack-o-lantern',
  thanksgiving: 'harvest-plaid',
  christmas: 'candy-cane',
} as const satisfies Record<Season, string>;

export type TableCardBack = CardBack | (typeof SEASONAL_CARD_BACKS)[Season];

export function getTableCardBack(roomBack: CardBack, season: Season | null): TableCardBack {
  return season ? SEASONAL_CARD_BACKS[season] : roomBack;
}

export function toCardBack(value: string | null | undefined): CardBack {
  return CARD_BACKS.find((back) => back.id === value)?.id ?? DEFAULT_CARD_BACK;
}

export interface CardBackChangedEvent {
  cardBack: string;
}

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
  canManageEstimates?: boolean;
}

export interface StoryHistory {
  id: string;
  title: string;
  url: string | null;
  status: 'pending' | 'active' | 'completed';
  finalScore: number | null;
  agreedEstimate?: number | null;
  estimateRevision?: number;
  jira?: JiraLink | null;
  votes: Vote[];
}
