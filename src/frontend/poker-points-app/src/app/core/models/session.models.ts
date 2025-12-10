export interface CreateSessionRequest {
  deckType?: string;
  name?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  accessCode: string;
  name: string | null;
}

export interface SessionInfo {
  id: string;
  accessCode: string;
  name: string | null;
  deckType: string;
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
