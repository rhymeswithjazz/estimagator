# Estimagator E2E Tests

End-to-end tests for the Estimagator poker planning application using Playwright.

## Setup

```bash
cd tests/e2e
npm ci
npx playwright install --with-deps
```

## Running Tests

### Prerequisites

Before running E2E tests, you need both backend and frontend running:

**Backend:**
```bash
cd src/backend/PokerPoints
docker compose -f ../../../docker/docker-compose.yml up -d  # Start PostgreSQL
dotnet run --project PokerPoints.Api --launch-profile http
```

**Frontend:**
```bash
cd src/frontend/poker-points-app
npm start
```

### Run Tests

```bash
# Run all tests (headless)
npm test

# Run with UI mode (interactive)
npm run test:ui

# Run in headed mode (see browser)
npm run test:headed

# Debug a specific test
npm run test:debug -- voting-flow.spec.ts

# View HTML report
npm run report
```

CI runs these tests as part of the main pipeline with a fresh database and backend, using all three configured browsers. `PLAYWRIGHT_START_SERVER=true` lets Playwright own the Angular development server in CI, so the browser connects to the local API on port 5051. The production frontend build is validated separately.

The guest creation endpoint permits 10 sessions per IP per 10 minutes. Repeated local runs against the same backend can reach that limit; use a fresh disposable test backend for each full verification run rather than weakening the application's rate limiter.

The appearance tests check the Scout logo, compiled styles, and horizontal layout at desktop/mobile widths in both themes. Chromium screenshots are retained in the browser-test artifact for visual review.

## Test Structure

```
tests/e2e/
├── specs/                    # Test specifications
│   ├── voting-flow.spec.ts   # Happy path: create → join → vote → reveal
│   └── ...
├── playwright.config.ts      # Playwright configuration
├── package.json             # Dependencies and scripts
└── README.md                # This file
```

## Test Scenarios

### Voting Flow (voting-flow.spec.ts)

**Happy Path:**
1. Organizer creates a session
2. Second player joins the session
3. Both players cast votes (5 and 8)
4. Organizer reveals votes
5. Verify average is calculated
6. Organizer reloads and retains the revealed round and host controls
7. Organizer resets votes
8. Verify both participants can vote again

**Observer Flow:**
1. Organizer creates a session
2. Observer joins as non-voting participant
3. Verify observer cannot cast votes
4. Verify observer can view revealed votes

## Writing New Tests

Tests use shared helpers and stable data-testid or accessible role selectors. Each participant uses a separate browser context so reconnect credentials are isolated. Example:

```typescript
import { test, expect } from '@playwright/test';

test('My test scenario', async ({ page }) => {
  await page.goto('/');

  // Use data-testid when available
  await page.click('[data-testid="create-session"]');

  // Fallback to text content
  await page.click('button:has-text("Create Session")');

  // Assertions
  await expect(page).toHaveURL(/\/game/);
  await expect(page.locator('[data-testid="session-code"]')).toBeVisible();
});
```

## CI/CD

The main pipeline calls `.github/workflows/e2e-tests.yml` on pushes and pull requests:

- Starts an isolated PostgreSQL service and the .NET 10 backend
- Serves Angular on port 4200 against the API on port 5051
- Runs Playwright tests in Chromium, Firefox, and WebKit
- Uploads test reports, screenshots, and backend logs even when a test fails

## Troubleshooting

### Tests fail with "Timeout waiting for page"

Backend or frontend may not be running. Check:
```bash
curl http://localhost:5051/health  # Backend health
curl http://localhost:4200         # Frontend
```

### Tests fail with "Session not found"

Database may not be initialized. Run migrations:
```bash
cd src/backend/PokerPoints/PokerPoints.Api
dotnet ef database update
```

### Browser doesn't launch

Install Playwright browsers:
```bash
npx playwright install --with-deps chromium firefox webkit
```

## Best Practices

1. **Use data-testid attributes** in components for stable selectors
2. **Test user flows**, not implementation details
3. **Keep tests independent** - each test should work in isolation
4. **Use test.step()** for better reporting and debugging
5. **Clean up after tests** - close extra pages, clear state
6. **Test across browsers** - Use projects in playwright.config.ts
7. **Use Page Object Model** for complex, reusable interactions

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging](https://playwright.dev/docs/debug)
