export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  emailVerified: boolean;
  role: string;
  sessionCount: number;
}

export interface AdminUserDetail extends Omit<AdminUser, 'sessionCount'> {
  externalProvider: string | null;
  sessions: AdminSessionSummary[];
}

export interface AdminSessionSummary {
  id: string;
  accessCode: string;
  name: string | null;
  isActive: boolean;
  createdAt: string;
  isOrganizer: boolean;
}

export interface UpdateUserRequest {
  displayName?: string;
  role?: string;
  emailVerified?: boolean;
}

export interface AdminSession {
  id: string;
  accessCode: string;
  name: string | null;
  deckType: string;
  isActive: boolean;
  createdAt: string;
  organizerEmail: string | null;
  participantCount: number;
  storyCount: number;
}

export interface AdminSessionDetail {
  id: string;
  accessCode: string;
  name: string | null;
  deckType: string;
  isActive: boolean;
  createdAt: string;
  organizer: { id: string; email: string; displayName: string } | null;
  participants: AdminParticipant[];
  stories: AdminStory[];
}

export interface AdminParticipant {
  id: string;
  displayName: string;
  isObserver: boolean;
  isOrganizer: boolean;
  userId: string | null;
}

export interface AdminStory {
  id: string;
  title: string;
  status: string;
  finalScore: number | null;
  voteCount: number;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}
