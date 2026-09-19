# Jira Cloud integration

## User workflow

1. Sign in to Estimagator and connect Jira in your profile. Each host uses their own account.
2. Open the story queue and choose **Import from Jira**. Select a Jira site, then type part of an issue key or title to narrow the suggestions. Search waits 150 ms after typing and shows a spinner. Titles appear below keys, with long titles truncated and the full title available on hover. Advanced search retains project selection and JQL. Project search defaults to Story issues; JQL can include other types.
3. Select issues and, if necessary, choose the editable numeric estimation field. Import shares summaries and links with anyone who has the session code. Full Jira descriptions are not copied.
4. Complete voting. The average remains separate from the **agreed estimate**. Confirm a number, then explicitly choose **Publish to Jira**.
5. If Jira changed since import or the last publish, review its current value before choosing **Replace Jira estimate**.
6. The registered host who ends the session can return through profile → session history to confirm, publish, reconnect, or retry. A guest ending host has no authenticated post-session publisher.

Guest voters need no Jira account. Host transfer never grants access to another person's Jira credentials. A new host must connect an account with access to the same Jira site and issue. Manual stories continue to work; agreed estimates are available even when Jira is disabled.

Only numeric estimates from 0 through 999.9, with at most one decimal place, are accepted. T-shirt decks require explicit numeric entry. Restarting voting clears the agreement but retains the publishing audit. Revealing votes, moving to another story, and ending a session never publish to Jira.

## Atlassian setup

Create an OAuth 2.0 (3LO) application in the [Atlassian developer console](https://developer.atlassian.com/console/myapps/). Add Jira API access, configure an exact callback URL, and request these classic scopes:

- `read:jira-work`
- `write:jira-work`
- `offline_access`

For production, the callback is `https://YOUR_APP/api/integrations/jira/callback`. Enable sharing in the app's distribution settings so accounts other than the developer can authorize it. Your organization's app-access controls may require administrator approval. The app operates under the connecting user's Jira permissions; OAuth scopes do not grant additional project permissions.

Use separate OAuth app registrations for development and production when their callback URLs differ. With the local backend on port 5051, use http://localhost:5051/api/integrations/jira`/callback` and frontend `http://localhost:4200`. Use `localhost` consistently, rather than mixing it with `127.0.0.1`, for the browser-bound OAuth cookie.

Jira's company-managed **Story Points** and team-managed **Story point estimate** can use different IDs. Estimagator discovers fields and checks issue edit metadata; no custom-field ID is assumed. Ambiguous mappings must be selected. If Jira does not expose an editable numeric field, import still works but publishing requires fixing Jira's field configuration or permissions. A story's field is fixed once a publishing attempt has been recorded, to preserve its baseline and audit trail.

References: [OAuth](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/), [enhanced JQL search](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/), [issue editing](https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issues/), [rate limits](https://developer.atlassian.com/cloud/jira/platform/rate-limiting/).

## Configuration and deployment

For local development, copy the repository-root `.env.example` to `.env` and fill in your OAuth credentials and absolute key directory. `.env` is ignored by Git. Use the API's `http` launch profile and the frontend on localhost:4200. The callback registered with Atlassian is the backend URL on port 5051, not the frontend URL.

Jira is **disabled by default**. Set backend environment variables only after registering the OAuth app:

| Backend configuration | Purpose |
| --- | --- |
| `Jira__Enabled=true` | Enable the connection/import/publishing UI and endpoints |
| `Jira__ClientId` | Atlassian OAuth client ID |
| `Jira__ClientSecret` | Atlassian OAuth secret; never put it in frontend configuration |
| `Jira__CallbackUrl` | Exact callback registered with Atlassian |
| `Jira__FrontendUrl` | Frontend origin used for the safe return redirect |
| `Jira__KeyPath` | Persistent directory for ASP.NET Data Protection keys |
| `Jira__CertificatePath` | PFX certificate protecting keys at rest; required outside Development |
| `Jira__CertificatePassword` | PFX password supplied as a secret |

The production compose file, production stack, and staging stack expose `JIRA_ENABLED`, `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET`, `JIRA_CALLBACK_URL`, `JIRA_FRONTEND_URL`, and `JIRA_CERTIFICATE_PASSWORD`. Their `JIRA_KEYS_PATH` and `JIRA_CERTIFICATES_PATH` host directories mount at `/var/lib/estimagator/jira-keys` and `/run/secrets/jira`; the PFX filename is `protection.pfx`.

Create the host directories before deployment. Give the existing API container user (`1026:100`) write access to the key directory and read access to the PFX. Keep the certificate directory read-only in the container. Back up the database, Data Protection key directory, and certificate/password together, storing secrets separately from the repository. All API replicas must use the same key ring and certificate. Losing the keys or certificate requires users to reconnect; it does not delete local stories or estimates. Preserve old decryption certificates when rotating protection; do not overwrite the sole usable certificate while existing keys depend on it.

The local `docker/docker-compose.yml` runs PostgreSQL only. When running the API on the host, set `Jira__KeyPath` to a persistent directory outside the repository. Development permits HTTP on loopback and does not require a protection certificate; production requires HTTPS and a certificate. Incomplete enabled configuration fails startup. Disabled Jira does not require credentials or certificates.

The additive `AddJiraIntegration` migration runs using the application's existing startup migration mechanism. It adds nullable agreements, estimate revisions, ending-host identity, Jira authorizations/sites, OAuth states, field mappings, issue links, and publish attempts. Old average scores are preserved and are **not** treated as confirmed agreements. Older closed sessions without a recorded ending host remain read-only for publishing.

Disable the feature with `JIRA_ENABLED=false` to remove Jira controls and stop Jira operations. Keep the additive database schema and encrypted data in place; rolling back the migration discards integration history and agreements. Ordinary estimation remains available.

## Reliability and recovery

- A publish attempt is saved before contacting Jira. Local agreement saving does not depend on Jira availability.
- PostgreSQL advisory locks coordinate import, token refresh, and writes across API instances. Writes are serialized per site/issue/field. Estimate revisions reject stale browser requests.
- If an estimate changes during an external write, only the revision actually sent is marked published; the newer agreement remains pending.
- A timeout may mean Jira accepted the write. Retry first reads Jira; an already matching value is recorded without another write. Interrupted attempts remain manually recoverable after restart.
- Rate-limit responses retain a retry time and enforce it server-side. There is no background publishing or automatic write retry loop.
- Conflict detection compares a fresh Jira read against the imported/last published baseline. Jira can still change between this read and the update; this is **not atomic compare-and-swap protection**.
- “Published” records the last successful operation, not continuous monitoring of Jira. Re-publishing checks Jira again.
- Disconnect removes locally held tokens. Revoke the grant separately at [Atlassian Connected apps](https://id.atlassian.com/manage-profile/apps).

Logs contain publishing attempt IDs, status, sanitized error categories, and duration. Jira HTTP client request logging is disabled to avoid credential disclosure. Do not enable request-body/header logging on integration routes. Existing application story logs may contain titles/URLs; handle application logs according to the same access policy as session content.

## Validation

Automated tests use fake Jira HTTP responses, never production Jira. Backend unit tests cover agreement validation, authorization, conflicts, stale revisions, token refresh, state replay, rate limits, uncertain outcomes, and import behavior. PostgreSQL integration tests run against disposable Testcontainers databases to verify migration compatibility, uniqueness, multi-request locking, real authenticated endpoints, and persistent token protection across app instances.

Run from the repository root:

```sh
dotnet test src/backend/PokerPoints
npm test --prefix src/frontend/poker-points-app -- --run
npm run build --prefix src/frontend/poker-points-app
cd tests/e2e
npx playwright test specs/jira-flow.spec.ts --project=chromium
```

Docker must be running for PostgreSQL integration tests. Browser tests use stubbed application APIs to test the UI; the PostgreSQL endpoint tests exercise the actual backend with a fake Jira transport. No fake endpoints or bypass credentials are enabled in production.

Before enabling for users, verify against a dedicated Jira test project: authorize a test host, search, discover the correct field, import, vote, confirm, publish, verify the Jira value, change it externally and exercise conflict review, end the session and retry from history, and restart the deployed container to verify the connection survives. This requires a real OAuth app and test-site access; automated fake-Jira tests do not establish live-site compatibility.
