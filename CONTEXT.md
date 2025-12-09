# Estimagator - Project Context

## Project Overview

**Estimagator** - A real-time story point estimation tool for agile teams. The core philosophy is "Zero Barrier to Entry" - organizers can start a session in seconds; participants can join via a URL without creating an account.

Tagline: "Bite-sized estimation for agile teams"

### Target Audience
- Agile/Scrum teams needing story point estimation
- Product owners and scrum masters facilitating planning sessions
- Remote and distributed teams

## Tech Stack

- **Backend**: .NET 8 (C#) with ASP.NET Core
- **Real-time**: SignalR for WebSocket communication
- **Frontend**: Angular 21 with standalone components
- **Styling**: Tailwind CSS 3 (v4 incompatible with Angular build)
- **Database**: PostgreSQL 16
- **Containerization**: Docker / Docker Compose

## Project Structure

```
poker-points/
├── src/
│   ├── backend/
│   │   └── PokerPoints/
│   │       ├── PokerPoints.Api/        # Web API + SignalR Hub
│   │       │   ├── Authentication/     # JWT auth, services, DTOs
│   │       │   ├── Hubs/               # SignalR Hubs
│   │       │   ├── Controllers/        # REST API Controllers
│   │       │   ├── Services/           # Business logic
│   │       │   └── Models/             # DTOs
│   │       ├── PokerPoints.Data/       # Data access layer
│   │       │   ├── Entities/           # EF Core entities
│   │       │   └── Migrations/         # Database migrations
│   │       └── PokerPoints.sln
│   └── frontend/
│       └── poker-points-app/           # Angular application
│           ├── src/app/
│           │   ├── core/
│           │   │   ├── guards/         # Auth guards
│           │   │   ├── interceptors/   # HTTP interceptors
│           │   │   ├── models/         # TypeScript interfaces
│           │   │   └── services/       # SignalR, GameState, Session, Auth
│           │   └── features/
│           │       ├── auth/           # Login, Register, Profile
│           │       ├── home/           # Landing page
│           │       ├── join/           # Join session page
│           │       └── game/           # Game room with voting UI
│           ├── tailwind.config.js      # Tailwind v3 config
│           └── postcss.config.js
├── docker/
│   └── docker-compose.yml              # PostgreSQL for dev
├── CONTEXT.md
└── PLAN.md
```

## Database Schema

### Entities
- **User**: Registered users with email/password or external SSO
  - `ExternalId`, `ExternalProvider` for SSO users
  - `RefreshToken`, `RefreshTokenExpiresAt` for JWT refresh
  - `EmailVerified`, `EmailVerificationToken`, `EmailVerificationTokenExpiresAt` for email verification
  - `PasswordResetToken`, `PasswordResetTokenExpiresAt` for password reset
- **Session**: A poker room with access code, linked to organizer User
- **Participant**: Users in a session (guest or authenticated via `UserId` FK)
- **Story**: Topics being estimated
- **Vote**: Individual card selections

### Key Relationships
- Session -> Participants (1:N, cascade delete)
- Session -> Stories (1:N, cascade delete)
- Session -> User/Organizer (N:1, set null on delete)
- Participant -> User (N:1, optional, set null on delete)
- Story -> Votes (1:N, cascade delete)
- Participant -> Votes (1:N, cascade delete)

## Development Setup

### Prerequisites
- .NET 8 SDK
- Node.js 18+
- Docker (for PostgreSQL)

### Backend
```bash
cd src/backend/PokerPoints
docker compose -f ../../../docker/docker-compose.yml up -d  # Start PostgreSQL
dotnet ef database update --project PokerPoints.Data --startup-project PokerPoints.Api
dotnet run --project PokerPoints.Api
```

### Frontend
```bash
cd src/frontend/poker-points-app
npm install
npm start  # Runs on http://localhost:4200
```

### Connection Strings
- Development: `Host=localhost;Port=5432;Database=pokerpoints;Username=pokerpoints;Password=pokerpoints`

### Running Services
| Service | URL |
|---------|-----|
| PostgreSQL | localhost:5432 |
| Backend API | http://localhost:5051 |
| SignalR Hub | ws://localhost:5051/hubs/poker |
| Angular Dev | http://localhost:4200 |

## Architecture Decisions

### Hybrid Authentication Model
Two-tier system supporting both guests and authenticated users:
- **Guests**: Can join sessions with just a display name (preserves "Zero Barrier" philosophy)
- **Authenticated users**: Can create sessions, have persistent identity, session history

### Single SignalR Hub
One `PokerHub` handles all game events. Uses SignalR Groups for session isolation.

### State Management
Angular Signals for UI state, RxJS for SignalR event streams.

### Vote Privacy
Votes stored immediately but values only broadcast on reveal.

## Recent Major Changes

### 2025-12-09 - Email Verification & Password Reset
- **What**: Full email-based authentication flow with SMTP support
- **Why**: Secure user registration with email verification, and self-service password recovery
- **Features Added**:
  - **Email verification**: Users receive verification link after registration
  - **Password reset**: Forgot password flow with secure token-based reset
  - **Access control**: Unverified users blocked from creating/joining sessions
  - **SMTP service**: Configurable SMTP for sending emails (with fallback logging when not configured)
- **Backend Changes**:
  - `User` entity: Added `EmailVerified`, `EmailVerificationToken`, `EmailVerificationTokenExpiresAt`, `PasswordResetToken`, `PasswordResetTokenExpiresAt`
  - `EmailService`: New service for sending verification and password reset emails
  - `AuthController`: New endpoints - `verify-email`, `resend-verification`, `forgot-password`, `reset-password`
  - `AuthService`: Methods for email verification, password reset, and token generation
  - `SessionsController`: Blocks unverified users from creating sessions
  - `PokerHub`: Blocks unverified users from joining sessions
- **Frontend Changes**:
  - `VerifyEmailComponent`: Handles email verification from link
  - `ForgotPasswordComponent`: Request password reset form
  - `ResetPasswordComponent`: Set new password form
  - `RegisterComponent`: Shows "check your email" message after signup
  - `LoginComponent`: Added "Forgot password?" link
  - `AuthService`: Methods for `verifyEmail`, `resendVerification`, `forgotPassword`, `resetPassword`
- **Configuration**:
  - `appsettings.json`: New `Email` section with SMTP settings
  - `docker/stack.yml`: Environment variables for SMTP configuration
  - `docker/.env.example`: Template with all required SMTP variables
- **Environment Variables**:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_USE_SSL`
  - `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_BASE_URL`
- **Database Migration**: `AddEmailVerificationFields`

### 2025-12-09 - Story Queue with Status Tracking
- **What**: Enhanced story queue with status display, scores, and re-voting capability
- **Why**: Stories now persist in queue after voting, showing their status and final scores
- **Features Added**:
  - **Persistent Queue**: Stories remain in queue after voting (no longer removed)
  - **Status Display**: Pending stories (white) vs completed stories (green tint)
  - **Score Badge**: Completed stories show their final score as a badge
  - **Re-vote Button**: Restart voting on any completed story (clears votes, resets score)
  - **Auto-advance**: "Next Story" button automatically pulls from queue
- **Backend Changes**:
  - `SessionService`:
    - `GetPendingStoriesAsync` now returns all non-active stories (pending + completed)
    - Added `ActivateStoryAsync(storyId)` - activate specific story
    - Added `RestartStoryAsync(storyId)` - clear votes and reset to active
  - `PokerHub`:
    - Added `StartStory(storyId)` - start specific story from queue
    - Added `RestartStory(storyId)` - re-vote on completed story
    - `NextStory` now auto-advances through queue, creates new story only if queue empty
    - New SignalR event: `StoryQueueUpdated`
- **Frontend Changes**:
  - `SignalRService`: Added `startStory`, `restartStory` methods and `storyQueueUpdated$` event
  - `GameStateService`: Added `startStory`, `restartStory` methods
  - `GameRoomComponent`: Simplified queue handlers, added `restartStoryFromQueue`
  - Queue UI: Conditional styling based on status, play vs restart buttons

### 2025-12-09 - Batch Story Management
- **What**: Organizers can now create and manage a queue of stories to estimate
- **Why**: Allows pre-planning estimation sessions with multiple stories
- **Features Added**:
  - **Story Queue**: Stories can be added to a queue before estimation
  - **Batch Import**: Add multiple stories at once (one per line, supports `Title | URL` or tab-separated format)
  - **Story URLs**: Each story can have an optional URL linking to a ticket/issue
  - **URL Display**: Clickable link icon appears next to story title when URL is present
  - **Queue Management**: Start, reorder, or delete stories from the queue
- **Backend Changes**:
  - `Story` entity: Added `Url` (nullable) and `SortOrder` properties
  - `SessionService`: Added `AddStoriesAsync`, `GetPendingStoriesAsync`, `UpdateStoryAsync`, `DeleteStoryAsync`
  - `PokerHub`: Added `AddStories`, `GetStoryQueue`, `UpdateStoryDetails`, `DeleteStory` methods
  - New SignalR events: `StoriesAdded`, `StoryDeleted`
- **Frontend Changes**:
  - `Story` interface: Added `url` property
  - `GameStateService`: Added `storyQueue` signal and queue management methods
  - `GameRoomComponent`: Added "Stories" button in header (organizer only) with slide-out panel
- **Database Migration**: `AddStoryUrlAndSortOrder`

### 2025-12-09 - Game Room Layout Improvements
- **What**: Fixed player card positioning and improved layout consistency
- **Why**: Cards were overlapping with the table and getting cut off with multiple players
- **Changes**:
  - **Superellipse positioning**: Player cards now use a superellipse (n=3) algorithm instead of regular ellipse, better matching the rounded rectangle table shape
  - **Story title relocated**: Moved from top of screen to footer area, freeing vertical space
  - **Compact footer**: Reduced card deck size (w-11 h-14), padding, and spacing
  - **Compact mode**: When >10 players, cards and name labels automatically shrink (36x54px cards, smaller text)
  - **Fixed card selection**: Removed raise-up animation on selected cards
  - **Reserved status space**: Footer status message area has fixed height to prevent layout shift
- **Debug helpers added**:
  - `gameState.addMockPlayers(count)` - Add mock players for UI testing
  - `gameState.removeMockPlayers()` - Remove mock players
  - Access via console: `ng.getComponent(document.querySelector('app-game-room')).gameState.addMockPlayers(12)`

### 2025-12-08 - UI Polish Phase Complete
- **What**: Completed initial UI polish phase; design system and styling are production-ready
- **Why**: Establish consistent visual identity before adding more features
- **Completed**:
  - Comprehensive design system with custom Tailwind theme
  - CSS Grid-based game room layout
  - Polished home and join session pages
  - Vote distribution display with computed signals
- **Deferred**: Light/dark mode toggle (future enhancement)

### 2025-12-08 - User Authentication
- **What**: JWT-based authentication with mock provider (Microsoft SSO ready)
- **Why**: Enable session ownership, persistent identity, and session history
- **Features Added**:
  - **Registration/Login**: Email + password with BCrypt hashing
  - **JWT tokens**: Access token (60min) + refresh token (7 days)
  - **Profile page**: Display name editing, session history
  - **Session creation**: Requires authentication (guests can still join)
  - **Session history**: Users see their created/participated sessions
  - **Auth header**: Shows user avatar when logged in
- **Backend Files**:
  - `Authentication/` - AuthService, JwtTokenService, DTOs, configuration
  - `Controllers/AuthController.cs` - Register, login, refresh, logout, me
  - `Controllers/UserController.cs` - Profile update
- **Frontend Files**:
  - `core/services/auth.service.ts` - Auth state with Angular Signals
  - `core/interceptors/auth.interceptor.ts` - Auto JWT injection
  - `core/guards/auth.guard.ts` - Route protection
  - `features/auth/` - Login, register, profile components
- **Configuration**: `appsettings.json` has `Authentication.Provider` (Mock/Microsoft)

### 2025-12-08 - Session Persistence & UI Polish
- **What**: Persistent session identity and game board UI improvements
- **Why**: Better UX for returning users and clearer participant status
- **Features Added**:
  - **Session persistence**: User identity stored in localStorage per session
  - **Multi-session support**: Can rejoin multiple different sessions independently
  - **Returning user detection**: Join page shows "Welcome back, [Name]!" with quick rejoin
  - **Auto-reconnect on reload**: Game room attempts to reconnect using stored identity
  - **Placeholder cards**: Empty card slots shown for participants who haven't voted
  - **Host badge**: Moved from header to below participant name at table
- **Storage**: `localStorage` with keys `poker-points-session-{CODE}`
- **Components Updated**:
  - `GameStateService` - Per-session identity storage, `attemptReconnect(code)`
  - `GameRoomComponent` - Auto-reconnect on init, placeholder card styling
  - `JoinSessionComponent` - Returning user detection and rejoin flow

### 2025-12-08 - Phase 6: Organizer Controls & Results
- **What**: Enhanced game flow with organizer controls and results display
- **Why**: Complete the full game loop with rich feedback
- **Features Added**:
  - Vote distribution display (shows count per card value after reveal)
  - Confetti animation on consensus (CSS-based celebration)
  - Story management (editable title, "Next Story" button)
  - Voting timer (30s, 1m, 2m options, auto-reveals on expiry)
- **Components Updated**:
  - `GameRoomComponent` - Timer state, story editing, confetti
  - `GameStateService` - Vote distribution computed signal
  - `styles.css` - Confetti keyframe animations

### 2025-12-08 - Phase 5: Game Table UI
- **What**: Full voting interface with poker table layout
- **Why**: Users can now vote on stories and see results in real-time
- **Components Updated**:
  - `GameRoomComponent` - Poker table with participants arranged in ellipse
  - Card deck at bottom for voting (Fibonacci, T-shirt, Powers)
  - Face-down/revealed card states for each participant
  - Results display with average and consensus detection
  - Vote progress indicator (X/Y voted)
- **Features**:
  - Select card to vote (click again to change)
  - Reveal button for organizer when all votes in
  - Reset button to start new round
  - Observer sidebar (non-voters)
  - Real-time vote status updates via SignalR

### 2025-12-08 - Phase 4: Lobby UI
- **What**: Lobby UI with create/join session flow
- **Why**: Users can now create games, share codes, and join sessions
- **Components Created**:
  - `HomeComponent` - Landing page with deck selection and join form
  - `JoinSessionComponent` - Name entry with observer toggle
- **Routes**: `/` (home), `/join/:code` (name entry), `/game/:code` (game room)
- **Note**: Downgraded from Tailwind CSS 4 to v3 due to Angular build incompatibility

### 2025-12-08 - Phase 3: Angular SignalR Integration
- **What**: Frontend services for real-time communication
- **Components Created**:
  - `SignalRService` - Hub connection with auto-reconnect
  - `GameStateService` - Reactive state with Angular Signals
  - `SessionService` - HTTP client for REST endpoints
- **Features**: Connection state signals, event streams, session storage for reconnect

### 2025-12-08 - Phase 2: SignalR Hub & Game Logic
- **What**: Backend real-time infrastructure and game services
- **Components Created**:
  - `PokerHub` - SignalR hub with all game methods
  - `SessionService` - Session CRUD and access codes
  - `ParticipantService` - Join/leave/reconnect logic
  - `VotingService` - Vote, reveal, reset operations
- **Hub Methods**: JoinSession, LeaveSession, CastVote, RevealVotes, ResetVotes, UpdateStory, NextStory

### 2025-12-08 - Phase 1: Project Scaffolding
- **What**: Initial project setup with .NET 8 + Angular 21
- **Why**: Establish foundation for real-time poker application
- **Impact**: Basic build pipeline working, database schema defined

## Implementation Phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | Complete | Project scaffolding & database |
| 2 | Complete | SignalR Hub & core game logic |
| 3 | Complete | Angular SignalR integration |
| 4 | Complete | Lobby & session creation UI |
| 5 | Complete | Game table UI (card deck, voting) |
| 6 | Complete | Organizer controls & results |
| 7 | Complete | User Authentication (JWT + mock provider) |
| 8 | Pending | Microsoft SSO integration |
| 9 | Complete | UI Polish (light/dark mode deferred) |
| 10 | Pending | Containerization & Deployment |

## API Endpoints

### Auth Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/auth/register` | No | Create account (sends verification email) |
| `POST /api/auth/login` | No | Login, returns JWT tokens |
| `POST /api/auth/refresh` | No | Refresh access token |
| `POST /api/auth/logout` | Yes | Invalidate refresh token |
| `GET /api/auth/me` | Yes | Get current user |
| `PUT /api/user/profile` | Yes | Update display name |
| `POST /api/auth/verify-email` | No | Verify email with token |
| `POST /api/auth/resend-verification` | No | Resend verification email |
| `POST /api/auth/forgot-password` | No | Request password reset email |
| `POST /api/auth/reset-password` | No | Reset password with token |

### Session Endpoints
| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/sessions` | **Yes** + Verified | Create session (requires verified email) |
| `GET /api/sessions/{code}` | No | Get session info |
| `GET /api/sessions/{code}/state` | No | Full game state |
| `GET /api/sessions/my-sessions` | Yes | User's session history |

### SignalR Hub: `/hubs/poker` (Working)
- `JoinSession(sessionCode, displayName, isObserver, existingParticipantId?)` - Returns Participant (blocks unverified users)
- `LeaveSession()` - Leave current session
- `CastVote(cardValue)` - Submit vote
- `RevealVotes()` - Organizer reveals all votes
- `ResetVotes()` - Clear votes for new round
- `UpdateStory(title)` - Set current story title
- `NextStory(title?)` - Move to next story (auto-pulls from queue)
- `GetSessionState()` - Get full game state
- `AddStories(stories[])` - Batch add stories to queue (organizer)
- `GetStoryQueue()` - Get all non-active stories (pending + completed)
- `UpdateStoryDetails(storyId, title, url)` - Update story title and URL (organizer)
- `DeleteStory(storyId)` - Remove story from queue (organizer)
- `StartStory(storyId)` - Start specific story from queue (organizer)
- `RestartStory(storyId)` - Re-vote on story, clears votes and score (organizer)

### SignalR Events (Client receives)
- `UserJoined` - Participant joined
- `UserLeft` - Participant left
- `VoteCast` - Someone voted (no value shown)
- `VotesRevealed` - All votes with values + stats
- `VotesReset` - Votes cleared
- `StoryUpdated` - Story title/status changed
- `StoriesAdded` - Stories added to queue
- `StoryDeleted` - Story removed from queue
- `StoryQueueUpdated` - Full queue refresh (after start/restart/next)
- `SessionState` - Full state broadcast
- `Error` - Error message

## Git Commit History

```
2bac376 feature: build poker table voting interface
87e3bb4 feature: implement lobby UI for session management
a626ee2 feature: add Angular core services and models
ca8f18c feature: scaffold Angular 21 application
462472a feature: add SignalR hub for real-time game events
b12e140 feature: implement backend services and REST API
9f6027f feature: add database schema and EF Core entities
492a12d feature: initialize project scaffolding
```

## TODO - Pending Items

### Microsoft Entra ID (Azure AD) SSO
**Status**: Infrastructure ready, awaiting credentials

To enable Microsoft SSO:
1. Get from IT/Azure portal:
   - Client ID (Application ID)
   - Tenant ID (Directory ID)
   - Client Secret
2. Update `appsettings.json`:
   ```json
   "Authentication": {
     "Provider": "Microsoft",
     "Microsoft": {
       "ClientId": "your-client-id",
       "TenantId": "your-tenant-id",
       "ClientSecret": "your-secret"
     }
   }
   ```
3. Implement Microsoft token validation in `AuthService`

## Out of Scope (Future)

- Light/dark mode toggle
- Custom deck creation
- Jira/Azure DevOps integration
- Team/organization management
