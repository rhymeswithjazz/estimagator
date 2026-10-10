**Review evidence and reproduction notes**

Captured September 18, 2026 against commit `e53ad46bb0b6114792d0e2f9835c402c3c30935f`.

`results.txt` contains the isolated PostgreSQL service reproductions and benchmark results. `backend-harness.cs.txt` is the exact console-program source used. It references the existing API project and does not modify application code. Create a temporary net10.0 executable project with a ProjectReference to `PokerPoints.Api.csproj`, copy this source to Program.cs, and run in Release mode using .NET 10. Use a NEW disposable PostgreSQL 16 database and adjust the local connection string/port before running. The recorded password is disposable test-only configuration. The program applies repository migrations, seeds synthetic records, and requires a fresh database on each run. On macOS use the canonical `/private/tmp` path for a temporary project to avoid symlink-relative project-reference resolution problems.

The benchmark has one warmup sequence per dataset (two calls), then five timed calls, each with a fresh DbContext. Times include database access, materialization, and DTO construction; they exclude HTTP, SignalR serialization, browser rendering, and multi-client contention. The 10/100/500 values include the one active story; all other stories are completed. Every story has 20 votes from 20 participants. The displayed joined-row count in the harness is calculated from that shape; `explain-500.txt` independently confirms the 500-story count.

`query-500.sql` was obtained with EF Core ToQueryString on the same Includes/filter/Take(1) shape used by the state method. To rerun EXPLAIN, substitute `@code` with `'BENCH500'` and `@p` with `1`, then execute `EXPLAIN (ANALYZE, BUFFERS)` against the seeded database. `explain-500.txt` is the captured result. Dataset statistics and buffer state affect timings and plans; no production capacity claim follows from this single-host exercise.

`frontend-harness.spec.txt` contains the four existing game-state tests plus three temporary review tests for queued-story assignment, stale result state, and expired-login restoration. It was copied into the frontend services directory as `architecture-review.temporary.spec.ts`, run with `npm test -- --run src/app/core/services/architecture-review.temporary.spec.ts`, and removed afterwards. These are defect-demonstration assertions that expect the CURRENT faulty behavior. Convert them to desired-behavior regression assertions when implementing fixes; do not retain the faulty expectations as compatibility tests. `frontend-repro-results.txt` records the run.

`dependency-audit-summary.json` retains the package/severity/advisory metadata from `npm audit --json` and `npm audit --omit=dev --json`. Totals are affected package entries, which can share advisories and include meta-vulnerabilities. Reachability was not assessed. The file deliberately separates production dependencies from build/test dependencies. Audit databases change, so rerunning may yield different results.

Existing verification commands:

- `/usr/local/share/dotnet/dotnet test --nologo` from `src/backend/PokerPoints`: 65 API tests and two placeholder tests passed; two NU1903 SSH.NET advisory warnings.
- `npm test -- --run` from the frontend: 25 tests passed.
- `npm run build` from the frontend: passed; 335.15 kB initial raw, 81.62 kB estimated transfer; game component style budget warning at 4.68 kB.
- `npm run test:coverage -- --run`: failed because `@vitest/coverage-v8` is missing.

The disposable Docker container `estimigator-review-20260918` was stopped and automatically removed after the check. No existing database/container was reused, stopped, or modified. The temporary frontend test was removed. Application source, dependency locks, and configuration remain unchanged.
