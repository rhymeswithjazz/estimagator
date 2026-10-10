# Estimagator

> Bite-sized estimation for agile teams

[![Backend CI](https://github.com/rhymeswithjazz/estimagator/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/rhymeswithjazz/estimagator/actions/workflows/backend-ci.yml)
[![Frontend CI](https://github.com/rhymeswithjazz/estimagator/actions/workflows/frontend-ci.yml/badge.svg)](https://github.com/rhymeswithjazz/estimagator/actions/workflows/frontend-ci.yml)
[![Docker Build](https://github.com/rhymeswithjazz/estimagator/actions/workflows/docker-build-push.yml/badge.svg)](https://github.com/rhymeswithjazz/estimagator/actions/workflows/docker-build-push.yml)

An agile estimation tool for real-time team sizing sessions. Teams join a shared session, vote on story points using various decks (Fibonacci, T-shirt sizes, etc.), and reveal votes simultaneously.

## Tech Stack

- **Backend**: ASP.NET Core 8 Web API + SignalR
- **Frontend**: Angular 21 with standalone components, Signals, Tailwind CSS 4
- **Database**: PostgreSQL 16 with Entity Framework Core
- **Real-time**: SignalR WebSocket hub
- **Deployment**: Docker containers on Synology NAS

## Quick Start

### Prerequisites

- .NET 8 SDK
- Node.js 22+
- Docker & Docker Compose
- PostgreSQL 16

### Backend Development

```bash
# Start PostgreSQL
docker compose -f docker/docker-compose.yml up -d

# Run the API
cd src/backend/PokerPoints
dotnet run --project PokerPoints.Api
```

API will be available at `http://localhost:5000`

### Frontend Development

```bash
cd src/frontend/poker-points-app
npm install
npm start
```

Frontend will be available at `http://localhost:4200`

## Docker Deployment

Pre-built multi-architecture images (amd64/arm64) are available on Docker Hub:

- `rhymeswithjazz/estimagator-api:latest`
- `rhymeswithjazz/estimagator-frontend:latest`

### Deploy with Docker Compose

```bash
docker compose -f docker/stack.yml up -d
```

The application will be available on port `7117`.

### Build Custom Images

```bash
./scripts/build-and-push.sh 1.0.0
```

## Architecture

### Backend Structure

- `PokerPoints.Api` - Controllers, SignalR Hubs, Services, DTOs
- `PokerPoints.Data` - EF Core DbContext, Entities, Migrations

### SignalR Hub

Single `PokerHub` at `/hubs/poker` handles all real-time game events. Sessions are SignalR Groups identified by `accessCode`.

### Data Model

- **Session** - Poker session with access code and deck type
- **Participant** - User in a session (tracks SignalR ConnectionId)
- **Story** - Item being estimated (status: pending/active/completed)
- **Vote** - Participant's card selection for a story

### Frontend

Angular Signals for UI state, RxJS for SignalR stream processing. Session identity and guest reconnect credentials are stored in browser `localStorage`.

**Participant reconnect security rollout**

Registered participants must reconnect using their original verified account. Guests receive a separate random reconnect credential; only its SHA-256 hash is stored in `Participants.ReconnectTokenHash`. Public participant IDs and the one-time guest-host reservation cannot substitute for this credential. Reconnect credentials are returned only to the joining caller and are excluded from public participant DTOs, snapshots, and broadcasts.

The additive `AddParticipantReconnectToken` migration preserves existing participants and votes. Finish existing guest sessions before deploying this update: legacy guests have no stored proof and cannot securely resume their old identity. They can explicitly choose "join as a new user"; this does not restore old host controls or reassign historical votes. Registered participants can resume using their original accounts.

Deploy the backend and frontend together and refresh open browser tabs: `JoinSession` now accepts a sixth reconnect-token argument and returns `{ participant, reconnectToken }`. Do not retain an ID-only compatibility fallback. The normal startup migration applies the new nullable hash column; apply it before traffic reaches the updated backend if migrations are managed separately. Rollback must not restore insecure ID-only reconnects; use a forward fix or temporarily restrict reconnects instead.

**Current round persistence rollout**

The additive `AddCurrentStory` migration stores `Sessions.CurrentStoryId`, so revealed rounds remain selected after reconnects, role changes, and host transfers. Story creation, queue selection, and restart update this reference; reveal retains it. The state response adds `votingResults` to restore the existing average and consensus display. Guest participation remains unchanged.

Apply the migration before the updated backend serves requests (normal startup applies it automatically), deploy the backend and frontend together, and refresh open tabs. Avoid mixed old/new backend instances: older code does not maintain the new reference. Backfill preserves all stories and votes, selecting an active story first or otherwise the most recently created completed story. Legacy sessions did not record which completed story was last displayed; if an older story had been revisited, that exact selection cannot be recovered automatically. Restarting the intended story establishes the reference for subsequent rounds. The migration's down operation removes only the reference, but reverting the application also restores the reveal/reconnect/reset defect.

## Configuration

### Backend

Default connection string:
```
Host=localhost;Port=5432;Database=pokerpoints;Username=pokerpoints;Password=pokerpoints
```

### Frontend

API endpoint: `http://localhost:5000`

CORS configured for local development at `http://localhost:4200`

## CI/CD

GitHub Actions workflows automatically:

- **Backend CI**: Build, test, and lint .NET code with PostgreSQL test database
- **Frontend CI**: Build, test, and lint Angular application
- **PR Checks**: Ensure all tests pass before merging
- **Docker Build**: Build and push multi-arch images to Docker Hub on main branch
- **Dependabot**: Automatically update dependencies weekly

## Contributing

1. Create a feature branch
2. Make your changes
3. Ensure all tests pass (`dotnet test` and `npm test`)
4. Push and create a pull request

## License

Internal tool for 121g/GovLink

## Documentation

See [CONTEXT.md](CONTEXT.md) and [CLAUDE.md](CLAUDE.md) for detailed project documentation.
