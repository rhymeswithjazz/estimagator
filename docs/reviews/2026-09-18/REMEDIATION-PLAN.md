**Estimagator remediation and regression-preservation plan**

Prepared September 18, 2026 for commit `e53ad46bb0b6114792d0e2f9835c402c3c30935f`. Finding IDs refer to the [architectural review](/Users/ras/Projects/estimigator/docs/reviews/2026-09-18/ARCHITECTURE-REVIEW.md). This is an implementation plan, not a claim that the fixes have been applied.

**Delivery rules**

Preserve supported behavior through characterization tests and small releases. Fix demonstrably unintended behavior—unauthorized access, hidden-vote disclosure, corrupt transitions—without preserving those defects as compatibility requirements. Keep UI flows, guest participation, five deck choices, role switching, host handoff, story queue/history, scoring presentation, timers, themes, and emoji interactions available. Avoid a framework rewrite or simultaneous infrastructure replacement.

Use additive schema and protocol changes first. Each pull request should contain one coherent behavior change, its regression checks, migration/rollback notes, and before/after measurements if it affects performance. Do not combine dependency upgrades, round-state redesign, and UI extraction in one release. Block rollout on failed authorization, state-consistency, or data-preservation tests.

Estimates below are rough engineering effort for one experienced developer, including focused tests, but excluding review queues and operational soak time. They are planning ranges, not a fixed-price commitment. The immediate security fixes should not wait for the complete refactor or perfect test coverage.

**Compatibility contract to capture before broad changes**

| Workflow | Behavior to retain | Mandatory regression scenarios |
|---|---|---|
| Create/join | Anonymous and verified-user creation; case-insensitive room codes; creator host reservation | Another guest joins before creator, invalid code, ended room, valid guest token, unverified user |
| Identity | Returning participant retains legitimate identity and controls | Refresh, temporary network loss, wrong-account reconnect rejection, two tabs, replaced connection |
| Voting | All offered cards; observer cannot vote; values hidden until reveal | Change vote, simultaneous votes, invalid card rejection, own-vote restoration, active-history request |
| Results | Current scoring/rounding and display unless explicitly changed | Empty votes, mixed numeric/special cards, consensus, reveal then refresh or role change |
| Rounds | Queue order, start selected, next, reset/vote again, restart history | Repeated commands, invalid target, concurrent actions, completed round remains displayed |
| Timer | Configured duration, extend, stop, automatic reveal, synchronized display | Late join, reconnect, background tab, expiry/start/reset race, deployment restart |
| Host | Transfer to connected voter or observer, leave prompts, guest targets | Old host loses controls, new host refreshes, double transfer, host disappearance |
| End/history | End controls and authorized access to retained results | Hub end, home-page end, admin deletion, active timer, multiple connected clients |
| Accounts/admin | Register, verify, login, refresh, reset, profile, search and paging | Expired saved login, simultaneous 401s, email failure, demotion/deletion, stale search response |
| Presentation | Existing responsive layout, theme selection, emoji/reactions | Desktop/mobile, keyboard flow, reduced motion, animation cleanup, all deck labels |

Capture route names, REST schemas, hub method/event names, error outcomes, queue ordering, and rounding fixtures. Screenshots should cover mobile and desktop voting, revealed results, settings/history, and host-transfer dialogs. The application can gain stricter validation while retaining every value selectable through its legitimate UI.

**Work packages**

| Package | Scope / findings | Depends on | Effort | Completion gate |
|---|---|---|---|---|
| A | Executable regression baseline and trustworthy release chain, F10–12 | None | 3–5 days | Clean checkout builds/tests; deployed SHA is tested SHA |
| B | Identity, room scope, vote confidentiality, F01–03 | Minimal tests from A; can ship urgently | 2–4 days | Negative authorization tests and valid reconnect flows pass |
| C | Authoritative rounds, atomic transitions, reducer, F04–05/F08/F14 | B, integration harness | 5–8 days | Multi-client state converges under concurrent operations |
| D | Timer and lifecycle correctness, F06/F13/F15 | C; presence work can start earlier | 3–5 days | Timers cannot affect another round; end/restart tests pass |
| E | Authentication resilience and request hardening, F09/F16/F17 | A/B | 3–5 days | Expiry/refresh/abuse/proxy tests pass |
| F | Query and retention-cost reduction, F07/F18/F19 | Snapshot contract from C; isolated query fixes can start sooner | 3–5 days | History-independent live query cost and DTO equivalence |
| G | Frontend extraction and asynchronous UI cleanup, F23/F24 | C/D/E | 2–4 days | Existing visual/interaction baselines pass |
| H | Operational readiness and deployment consistency, F20–22 | A/D/F | 2–4 days | Upgrade/rollback/restore drill and observability gates |

Allow approximately 23–40 engineering days for the complete program, adjusting after the first integration and load baselines. Optional multi-instance infrastructure is a separate capacity-driven project. This estimate does not imply all work must finish before the urgent fixes can be deployed.

**A — Establish useful tests and one release path**

1. Pin the .NET 10 SDK policy and a supported Node version across local instructions, CI, and Docker. Install/version the EF tool only if retained as a deployment step. Replace the unsupported Node 25 build image. Update the documented JWT environment name to the actual configuration binding.
2. Add the matching `@vitest/coverage-v8` dependency; use explicit non-watch test execution in CI. Generate/commit an E2E lockfile. Preserve package-lock reproducibility and pin tools currently invoked through unversioned `npx` where appropriate.
3. Replace placeholder integration tests with a real PostgreSQL fixture applying migrations. Add a WebApplicationFactory-compatible entry point and a local full-stack harness with isolated database and controlled email stub. Keep fast unit tests; use PostgreSQL for constraints, SQL translation, atomicity, and concurrency.
4. Repair E2E setup: either exercise the actual nginx/API/database stack or use a dev frontend pointed at the correct test API. Do not serve a relative-URL production build without its proxy. Use separate browser contexts for every simulated player, deterministic test IDs, exact assertions, and no swallowed failures.
5. Consolidate duplicate image publishers. Tests/security/build must precede publishing; deployment must consume the exact successful build's immutable digest. Support both develop/staging and main/production. Add per-environment deployment concurrency and expose a build identifier in health/version output.
6. Apply dependency remediation in its own change set: aligned Angular packages, Vitest/UI/coverage, and Testcontainers' transitive chain. Rerun both all-dependency and production-only audits; document any remaining reachable exception instead of hiding severity with a global ignore.

Acceptance: failing a regression deliberately prevents publishing/deployment; a fresh checkout can run the full chain; two separate players cast different votes and both see the same exact result; the observer assertion fails when voting becomes available. Save test logs, not just coverage percentages. No arbitrary coverage percentage substitutes for the behavior matrix.

**B — Close the authorization defects with minimal scope**

1. Introduce a reconnect proof distinct from participant ID. Registered users must match the stored owner. Guests get a cryptographic random credential whose hash is stored server-side. Responses containing credentials are caller-only and never broadcast or exposed in public session DTOs.
2. Add session ownership predicates to all story lookups and active-session checks to commands. Reject invalid targets before completing the current story or stopping a timer. Make the service boundary enforce this so future callers cannot accidentally bypass it.
3. Centralize vote disclosure: active history returns no other participants' vote values. A participant-specific snapshot can return their own selection. Keep completed history intact.
4. Add tests for anonymous takeover of a registered host, wrong authenticated user, reused/revoked guest proof, cross-room edit/delete/start/restart, and unrevealed-history access. Assert the database and outbound events remain unchanged after rejection.

Legacy rollout: do not invent a guest proof from a public ID. An additive release can issue proofs to established connections whose legitimate origin can be established, but existing compromised identity cannot be retroactively proven. Safest treatment for old guest sessions is a planned boundary: drain/end those sessions or require a host recovery/rejoin flow. A still-valid creator reservation may be used only under a deliberately defined recovery policy. Remove ID-only fallback when enforcement starts. This requires a documented migration choice; indefinite insecure fallback defeats the fix. Preserve authenticated ownership-based recovery immediately.

Rollback: retain additive columns and new credentials. Prefer a forward fix; do not roll back to an insecure public-ID reconnect path. A maintenance window for guest sessions is preferable to silently weakening authorization.

**C — Make the server's round state authoritative**

1. Define session invariants: at most one displayed current round, at most one active voting story, exactly the intended host ownership, and vote mutations only for the current accepting round. Decide whether completed selected stories are viewed or restarted; preserve the UI's distinct start/restart actions.
2. Add durable current-story/round references and a monotonically increasing session or round version. Keep voting phase distinct from queue/history status where needed. Audit existing multiple-active-story/host records before adding constraints; do not discard votes to force a migration through.
3. Introduce session commands used by hub, HTTP lifecycle paths, and timers. Each command loads actor and session, validates target/state, applies changes atomically, increments version, and returns an accepted result plus events. Prefer a session row lock or optimistic compare-and-swap with bounded conflict handling. A process-only semaphore is insufficient for multiple processes and restarts.
4. Make vote upserts atomic and tie acceptance to the round version. Use the same synchronization boundary for reveal so no late vote can mutate a closed result. Extract a single scoring function with golden fixtures for existing rounding, special cards, and consensus.
5. Add compatible event fields for session, story/round, and version. A command can return the authoritative resulting story/snapshot, removing the frontend's 100 ms delay and ambiguous success. Keep old fields during transition and define support for an old browser tab across a deployment.
6. Replace scattered frontend mutations with a reducer that applies both snapshots and events. Update queue metadata independently, reset all round-scoped fields together, derive results consistently, ignore stale versions, and request a snapshot on gaps. Full snapshot fetches should be coherent, not interleaved unversioned fragments.

Acceptance: reveal → refresh and vote-again work; editing a pending story leaves current selection unchanged; lost/reset/late events converge; simultaneous next/restart produces one current round; no cross-room or post-reveal vote is accepted; clients agree with stored scores. Use separate DbContexts and transport connections to test concurrency, since a single serialized caller cannot exercise the risks.

Migration: add nullable references/version fields first, deploy compatible readers/writers, backfill from documented state rules, and validate inconsistent legacy rows before enforcing constraints. Do not infer the displayed completed story solely from maximum SortOrder: blank stories currently default to zero. Preserve original data for manual reconciliation of ambiguous cases.

**D — Fix timers, presence, and terminal transitions**

1. Bind deadline ownership to session, story/round version, and timer generation. Starting/extending/stopping a timer is an atomic session command. Persist deadlines if restart continuity is required.
2. Make expiry idempotent: only the matching generation can claim completion, and the same transaction verifies the round is still accepting votes. A stale callback becomes a no-op. Restore pending deadlines at startup with an explicit policy for deadlines that elapsed while offline.
3. Use one event contract for manual stop, next/reset/restart, reveal, end, and automatic expiry. All clients clear timers when a round ends; local countdown remains a visual deadline calculation rather than an authority to reveal.
4. Define presence separately from historical participants. Use a connection table/set or explicit takeover semantics and generation-aware disconnects. Make join idempotent and remove previous group membership when switching rooms. Expire stale presence after crashes.
5. Reuse lifecycle commands for HTTP deactivation, hub end, and admin deletion; stop timers and publish terminal state consistently. Reject further domain mutations after end.

Acceptance: deterministic fake-time unit tests plus real integration tests around expiry races; late old disconnect cannot mark a new connection offline; API restart cannot report dead connections as live indefinitely; deleting/ending a room with a running timer leaves no callback acting on it. Preserve participant/vote history during presence cleanup.

**E — Repair authentication and bound expensive requests**

1. Implement asynchronous auth bootstrap with saved refresh-token restoration. Guards and the connection manager wait for readiness without blocking anonymous access.
2. Deduplicate HTTP refreshes through one shared in-flight operation. Coordinate tabs if multi-tab sessions must be supported. Rotate refresh tokens atomically and define the session model explicitly: one token per user currently causes devices/tabs to invalidate each other.
3. Refresh the access token dynamically for SignalR negotiation/reconnect; serialize connection lifecycle; expose a recoverable failure state for unsuccessful initial start and room restore.
4. Validate signing key/issuer/audience configuration at startup. Hash and index opaque action tokens, remove query credentials from access logs, and define revocation for password reset, account deletion, and role changes. Scope the HTTP interceptor to the application's API origin/path.
5. Configure trusted forwarded headers using the actual nginx/outer-proxy addresses. Add separate registration/login/email/join/session-command limits and concurrency budgets. Validate card/deck/timer/text inputs before database writes.
6. Decouple email transport from request success using a durable send/outbox job if delivery reliability warrants it. Preserve generic forgot-password responses and provide retries for SMTP failure; use the configured token lifetime consistently in both persisted expiration and email text.

Acceptance: expired saved login refreshes, concurrent 401s cause one refresh, reconnect uses new credentials, transient network errors do not masquerade as invalid login, ordinary office users do not share an nginx-IP quota, and forged forwarded headers cannot evade limits. Test SMTP failure after account creation and single-use token races.

**F — Remove history from live operations and measure the result**

1. Replace `CastVote`'s full-state read with a narrow authorized participant/session/current-round lookup. Build a live snapshot from projected participants, displayed story, and current-round vote data only. Do not return hidden values in shared snapshots.
2. Separate queue/history reads from live state. Use no-tracking DTO projections for read-only results; paginate completed history while keeping all records accessible. Project admin vote counts rather than vote entities. Preserve queue ordering and metadata.
3. Add targeted indexes: non-null connection lookup; session/status/sort order for story selection; token-hash lookup; any ownership/list ordering index justified by an actual query plan. Coordinate uniqueness constraints with package C. Avoid duplicate FK indexes and speculative indexing of every field.
4. Replace repeated list membership/search in assembly code with sets/maps where useful. Preserve result ordering; deterministic secondary keys prevent unstable pages when timestamps/sort orders tie.
5. Expire emoji limiter entries and bound payload sizes. Add growth metrics and explicit retention policy; no automatic deletion of history belongs in a performance-only patch.

Measurement matrix: 5/20/50 participants × 1/100/500 historical stories, then 10/50/100 simultaneous rooms on the intended deployment hardware. Separate idle sockets, vote bursts, snapshot/reconnect bursts, queue imports, and permitted emoji traffic. Record p50/p95/p99 latency, error/conflict rate, SQL command count/rows, allocation/GC, CPU/RSS, connection-pool wait, PostgreSQL buffers/temp I/O, and outbound event bytes. Warm up, run repeated fixed workloads, record versions/resources, and retain raw measurements.

Proposed gates, to calibrate to actual hardware: live command SQL touches no historical vote rows; snapshot rows scale with participants/current-round votes, not history; 500-history median snapshot service time is within 25% of the 10-history case at fixed participants and comfortably below the old 596 ms baseline. Under the agreed room target, aim for p95 vote acknowledgement under 200 ms, snapshot/rejoin under 500 ms, and zero lost/duplicate accepted votes. These are proposed targets, not measurements achieved by this review. Run a churn soak to ensure limiter/presence memory plateaus after expiry.

Changing to `AsSplitQuery` can be an interim mitigation, but measure its extra round trips and snapshot consistency. Do not stop at that change while every live call still materializes all history.

**G — Simplify presentation without changing the experience**

Extract the participant table, result display, timer controls, story controls, and effects controller behind the existing view state. Precompute vote/position view models and clean up timeouts/RAF work on destroy. Batch geometry reads and retain existing effect caps and reduced-motion behavior. Use cancellation/request IDs for admin searches. Replace arbitrary delays with command results. Make rejected commands visible and prevent duplicate pending submissions where appropriate.

Acceptance: screenshot and interaction comparisons at desktop/mobile sizes, all themes/decks/effects, keyboard controls, route leave/rejoin, and delayed-network scenarios. Profile animation frame time at 5/20/50 participants; use a 60 Hz frame budget as a diagnostic target, not a universal device guarantee. Avoid list virtualization or visible layout changes until measured need justifies them. Remove the CSS warning through scoped organization/minification only if visuals stay equivalent.

**H — Make operations observable and recoverable**

Separate `/health/live` from bounded database-backed readiness; retain `/health` compatibility as needed. Add build identity, structured command metrics, tracing across HTTP/hub/database calls, and redaction. Propagate cancellation for abandoned reads, with deliberate handling for commands already committed. Define how clients recover if commit succeeds but broadcast fails; versions and resync are the first safeguard, with an outbox for stronger delivery guarantees.

Make schema migration a controlled deployment step with least-privilege runtime credentials. Harmonize stack/compose settings, test custom database names and SMTP, and cache only versioned assets immutably. Verify an actual backup restore and record RPO/RTO requirements. Exercise same-version restart, additive upgrade, rollback, a browser left open across the release, nginx/API reconnect, and database unavailability.

Keep a documented single-API deployment until load measurements require more. A future multi-instance package must include SignalR backplane/service, affinity where required, shared timer ownership, presence, and applicable global limits. Its gate is a two-node failure/rejoin test, not simply increasing the replica count.

**Release gates and rollback procedure**

For each package, run targeted unit tests, PostgreSQL integration tests, contract fixtures, affected E2E flows, production build, and relevant dependency checks. Query changes add benchmark/query-plan comparison; UI changes add visual verification; migration changes add upgrade tests on a copy with realistic history and legacy anomalies.

Deploy the exact verified image digest to staging. Run two- and multi-player voting/reveal/reset/host-transfer/timer flows, then failure injection for reconnect and deployment. Observe one representative working session and a reconnect/churn workload before production. Promote with monitoring for error rate, latency, conflict/retry rate, live-state resyncs, and database temp I/O. Do not load-test production by default.

Retain the previous image digest and compatible additive schema. Roll back presentation/query changes independently when possible. For identity and disclosure fixes, prefer forward repair or temporary restriction of the affected operation rather than restoring the vulnerability. Do not run destructive down-migrations against user votes as an automatic rollback. Take and verify a database backup before irreversible schema changes; postpone removing legacy columns/protocol fields until supported old clients have drained.

**Decisions that must be recorded before their dependent implementation**

These do not block the immediate scoped authorization fixes or live-query optimization:

- Legacy guest ownership recovery: planned session drain, recovery token workflow, or another explicitly secure migration boundary.
- Multiple tabs/devices: shared participant with multiple connections, or intentional takeover; existing single-string behavior is ambiguous.
- Scoring: whether `½` should become numeric and whether consensus includes nonnumeric cards. First preserve documented current fixtures; change scoring separately if desired.
- Offline voters: whether their votes/counts remain in the current round. Preserve current behavior until decided.
- Deployment semantics: whether a timer continues through downtime and whether expired offline rounds auto-reveal immediately on restart.
- Retention and capacity: expected participants per room, simultaneous rooms, history retention/export, latency target, RPO/RTO, and whether multi-instance deployment is actually needed.

The safest first implementation sequence is A's minimal harness + B, then C/D, then F, with E and release-chain repair progressing independently where interfaces permit. G follows state stabilization; H closes the operational rollout. Every finding F01–F24 is assigned above.
