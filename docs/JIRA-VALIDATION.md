# Jira integration validation — updated 2026-09-19

Implemented the ten-story backlog: scoped story mutations, agreed estimates, Jira persistence, personal OAuth connections, issue search/field discovery, queue import, explicit publishing, conflict/retry recovery, history controls, and deployment/CI configuration. Jira remains disabled by default.

## Automated results

| Check | Result |
| --- | --- |
| Backend solution tests (.NET 10) | Initial solution run: 100 passed (96 API, 3 integration, 1 data). Latest API suite: 98 passed, including picker tests |
| Frontend Vitest tests | 36 passed |
| Chromium Jira browser flows | 3 passed |
| Production Angular build | Passed |
| EF migration/model consistency | No pending model changes |
| Compose configuration validation | Production compose, production stack, staging stack, local database compose passed |
| Patch whitespace | Passed with `cr-at-eol`, preserving existing repository CRLF files |

The PostgreSQL endpoint test uses disposable Testcontainers databases and a fake Jira HTTP handler. It covers OAuth browser state and replay rejection, import/search, concurrent duplicate imports, serialized token refresh, stale estimate revisions, conflicts, concurrent publishing without duplicate writes, session closure/history, and decrypting credentials from a second application instance. Migration tests upgrade an existing score and verify issue-link uniqueness per session.

Browser tests simulate application REST/SignalR responses. They exercise the real Angular UI for live queue import, history confirmation/publishing/reconnect/conflict review, and participant read-only access. Screenshots are produced in the ignored `tests/e2e/test-results` directory and were visually inspected.

Unit tests additionally cover uncertain write outcomes, interrupted attempts, rate-limit retry guards, own-account requirements after host transfer, read-only imports, field ambiguity/team-managed naming, invalid numeric estimates, restart behavior, and cross-session mutation rejection.

## Limits and existing warnings

- A local Atlassian OAuth app was subsequently configured and the user reported the integration working. Automated tests still use fake Jira responses; a complete live write-back/conflict/restart verification has not been independently recorded. The latest issue-picker behavior is covered by mocked backend and browser tests.
- Restart validation uses independent application instances sharing persistent keys. A deployed container/certificate restart has not been performed.
- The local database was migrated during development startup. No production deployment was performed. Automated database validation used disposable databases.
- Backend restore/build reports existing high-severity advisory warnings for the test project's transitive `SSH.NET` 2024.1.0 dependency. This dependency was not added or changed by the Jira implementation.
- Angular reports the existing game-room component style budget warning (4.68 kB against a 4 kB warning threshold). The build succeeds.
- Compose checks used the standalone `docker-compose` binary because this environment's `docker compose` plugin is unavailable. Production secret variables were unset; no secrets were printed or deployed.

## Review boundaries

Existing untracked files under `docs/reviews/2026-09-18` were left untouched. Setup instructions are in [JIRA-INTEGRATION.md](JIRA-INTEGRATION.md). Frontend CI now runs the three Jira browser tests; backend CI's existing solution test command includes the new fake-Jira/PostgreSQL tests.
