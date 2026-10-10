# Estimagator

> Bite-sized estimation for agile teams

[![CI/CD Pipeline](https://github.com/rhymeswithjazz/estimagator/actions/workflows/pipeline.yml/badge.svg)](https://github.com/rhymeswithjazz/estimagator/actions/workflows/pipeline.yml)

An agile estimation tool for real-time team sizing sessions. Teams join a shared session, vote on story points using various decks (Fibonacci, T-shirt sizes, etc.), and reveal votes simultaneously.

## Tech Stack

- **Backend**: ASP.NET Core 10 Web API + SignalR
- **Frontend**: Angular 21 with standalone components, Signals, Tailwind CSS 4
- **Database**: PostgreSQL 16 with Entity Framework Core
- **Real-time**: SignalR WebSocket hub
- **Deployment**: Docker containers on a DigitalOcean droplet (Intel), updated by Watchtower

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

Pre-built images are available on Docker Hub for Intel (`amd64`, what the production droplet runs) and ARM (`arm64`, for Apple-silicon Macs):

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

`CI/CD Pipeline` is the single entry point for pushes to `main`/`develop`, release tags (`v*`), pull requests, and manual runs. It calls the reusable backend, frontend, and browser-test workflows once each. They check formatting, run tests and coverage, build the application, and reject high/critical dependency advisories. Browser tests use .NET 10, an isolated PostgreSQL service, and Chromium, Firefox, and WebKit against the API on port 5051.

Image publication waits for **all** checks to pass. Successful `main` and release-tag runs publish both architectures to Docker Hub with the existing branch/date/release tags plus a full `sha-<commit>` tag. The API and frontend images build in parallel; runs for the same image are serialized to avoid overlapping updates to shared tags. The Dockerfiles compile on the runner's own CPU and cross-compile for ARM, so the ARM image adds seconds, not minutes.

**Deployment is automatic through Watchtower.** The production droplet runs the stack with Docker, and Watchtower on it pulls each new `latest` image and restarts that container. The two images publish separately, so for a short window one can be newer than the other. Each image job's summary records the immutable digest and the `sha-<commit>` tag; an image upload is not confirmation that the application has been deployed. `DOCKERHUB_TOKEN` is required only for publishing images. Test/coverage reports and the frontend build are retained as workflow artifacts for seven days.

Before pushing, run the same local checks:

```bash
# From src/backend/PokerPoints, with the .NET 10 SDK and Docker available:
dotnet restore
dotnet format --no-restore --verify-no-changes
dotnet test --configuration Release

# From src/frontend/poker-points-app:
npm ci
npm run format:check
npm run test:coverage
npm run build
npm audit --audit-level=high

# From tests/e2e, with a fresh test backend on port 5051:
npm ci
npx playwright install --with-deps
CI=true PLAYWRIGHT_START_SERVER=true npm test
```

Run `dotnet format` or `npm run format` to fix formatting before repeating the checks. The frontend pins Prettier and matching Vitest/coverage versions, and both npm projects commit their lockfiles. Tailwind 4's PostCSS configuration is in `.postcssrc.json`; brand tokens and compatibility styles live in `src/styles.css`. The migration preserves the existing palette, sibling spacing, shadows, and form defaults. Supported browsers must meet Tailwind 4's minimums (Safari 16.4, Chrome 111, Firefox 128) as well as Angular's support requirements.

## Contributing

1. Create a feature branch
2. Make your changes
3. Ensure all tests pass (`dotnet test` and `npm test`)
4. Push and create a pull request

## License

Internal tool for 121g/GovLink

## Documentation

See [CONTEXT.md](CONTEXT.md) and [CLAUDE.md](CLAUDE.md) for detailed project documentation.
