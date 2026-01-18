# Estimagator E2E Tests

End-to-end tests for the Estimagator poker planning application using Playwright.

## Setup

```bash
cd tests/e2e
npm install
npx playwright install --with-deps
```

## Running Tests

### Prerequisites

Before running E2E tests, you need both backend and frontend running:

**Backend:**
```bash
cd src/backend/PokerPoints
docker compose -f ../../docker/docker-compose.yml up -d  # Start PostgreSQL
dotnet run --project PokerPoints.Api
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
6. Organizer resets votes
7. Verify votes are cleared

**Observer Flow:**
1. Organizer creates a session
2. Observer joins as non-voting participant
3. Verify observer cannot cast votes
4. Verify observer can view revealed votes

## Writing New Tests

Tests use Playwright's Page Object pattern and data-testid selectors where available. Example:

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

E2E tests run automatically on PRs to main via `.github/workflows/e2e-tests.yml`:
- Starts PostgreSQL service
- Builds and runs backend
- Builds and serves frontend
- Runs Playwright tests in Chromium
- Uploads test reports and screenshots on failure

## Troubleshooting

### Tests fail with "Timeout waiting for page"

Backend or frontend may not be running. Check:
```bash
curl http://localhost:5000/health  # Backend health
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
npx playwright install --with-deps chromium
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
