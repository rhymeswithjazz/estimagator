# Repository Guidelines

## Project Structure & Module Organization

Estimagator is split into a .NET backend and Angular frontend. Backend code lives in `src/backend/PokerPoints`: `PokerPoints.Api` contains controllers, SignalR hubs, services, DTOs, and auth code; `PokerPoints.Data` contains EF Core entities and migrations; `*.Tests` projects contain xUnit tests. Frontend code lives in `src/frontend/poker-points-app`, with app code under `src/app`, environments under `src/environments`, and static files in `public`. End-to-end tests are in `tests/e2e/specs`; Docker files are under `docker/`.

## Build, Test, and Development Commands

- `docker compose -f docker/docker-compose.yml up -d`: start local PostgreSQL.
- `cd src/backend/PokerPoints && dotnet restore && dotnet build`: restore and build the backend.
- `cd src/backend/PokerPoints && dotnet run --project PokerPoints.Api --launch-profile http`: run the API at `http://localhost:5051`.
- `cd src/backend/PokerPoints && dotnet test`: run backend unit and integration tests.
- `cd src/frontend/poker-points-app && npm ci && npm start`: install dependencies and serve Angular at `http://localhost:4200`.
- `cd src/frontend/poker-points-app && npm test`: run Vitest tests.
- `cd src/frontend/poker-points-app && npm run build`: build the production frontend.
- `cd tests/e2e && npm ci && npm test`: run Playwright tests after backend and frontend are running.

## Local Deployment Notes

The Angular environment points to `http://localhost:5051/api` and `http://localhost:5051/hubs/poker`, so keep the API on port `5051` for local full-stack testing. Port `5000` may be occupied by macOS services such as AirPlay/Control Center.

The default Docker compose database binds PostgreSQL to `5432`. If another local container already owns `5432`, run an isolated test database on `5433` instead:

```bash
docker rm -f pokerpoints-db-codex >/dev/null 2>&1 || true
docker run -d --name pokerpoints-db-codex \
  -e POSTGRES_USER=pokerpoints \
  -e POSTGRES_PASSWORD=pokerpoints \
  -e POSTGRES_DB=pokerpoints \
  -p 5433:5432 \
  postgres:16-alpine
```

Then start the API against that database:

```bash
cd src/backend/PokerPoints
ConnectionStrings__DefaultConnection='Host=localhost;Port=5433;Database=pokerpoints;Username=pokerpoints;Password=pokerpoints' \
  ASPNETCORE_URLS='http://localhost:5051' \
  dotnet run --project PokerPoints.Api --launch-profile http
```

Start the frontend separately with `cd src/frontend/poker-points-app && npm start`, then open `http://localhost:4200/`. The API health endpoint is `http://localhost:5051/health`.

## Coding Style & Naming Conventions

Use spaces for indentation. Frontend `.editorconfig` sets 2-space indentation, final newlines, and trimmed trailing whitespace. TypeScript uses single quotes and Prettier uses a 100-character print width. Put Angular features in `src/app/features`, shared components in `src/app/shared`, and core services/models/guards in `src/app/core`. C# enables nullable reference types and implicit usings; use PascalCase for types and methods, camelCase for locals and parameters.

## Testing Guidelines

Backend tests use xUnit, FluentAssertions, Moq, EF Core InMemory, and coverlet. Name C# tests around behavior, for example `SessionServiceTests.cs` and `CreateSession_ShouldReturnAccessCode`. Frontend tests use Vitest with `*.spec.ts` files beside the code under test. E2E tests use Playwright and should prefer stable `data-testid` selectors.

## Commit & Pull Request Guidelines

Recent commits are short, lower-case summaries such as `fixed timer bug` and `added synced timer`. Keep commits single-purpose and concise. Pull requests should describe the change, list validation commands run, link the issue or work item when available, and include screenshots or recordings for UI changes. Note database migrations, deployment changes, or new environment variables.

## Security & Configuration Tips

Do not commit secrets. Use environment variables for credentials such as connection strings and `JWT_SECRET_KEY`. Keep local overrides in `.env` or shell configuration, and verify Docker compose changes against both local and stack files when deployment behavior changes.
