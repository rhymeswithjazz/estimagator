export interface CreateSessionRequest {
  deckType?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  accessCode: string;
}

export interface SessionInfo {
  id: string;
  accessCode: string;
  deckType: string;
  isActive: boolean;
  createdAt: string;
  participants: Participant[];
  currentStory: Story | null;
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

// Deck configurations
export type DeckType = 'fibonacci' | 'tshirt' | 'powers';

export const DECK_VALUES: Record<DeckType, string[]> = {
  fibonacci: ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'],
  tshirt: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕'],
  powers: ['1', '2', '4', '8', '16', '32', '64', '?', '☕'],
};
