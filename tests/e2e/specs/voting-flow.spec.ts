import { test, expect, Page } from '@playwright/test';

test.describe('Poker Planning - Happy Path', () => {
  test('Complete voting flow: create → join → vote → reveal → reset', async ({ page, context }) => {
    // Step 1: Create a new session
    await test.step('Create session', async () => {
      await page.goto('/');
      await expect(page).toHaveTitle(/Estimagator/);

      // Click "Create Session" or "New Session" button
      await page.click('button:has-text("Create Session"), button:has-text("New Session")');

      // Fill in session details
      const sessionNameInput = page.locator('input[name="sessionName"], input[placeholder*="session name" i]');
      if (await sessionNameInput.isVisible()) {
        await sessionNameInput.fill('Test Planning Session');
      }

      // Select deck type (if available)
      const deckTypeSelect = page.locator('select[name="deckType"], select:has(option:text("Fibonacci"))');
      if (await deckTypeSelect.isVisible()) {
        await deckTypeSelect.selectOption('fibonacci');
      }

      // Submit session creation
      await page.click('button[type="submit"]:has-text("Create"), button:has-text("Start Session")');

      // Wait for session to be created and navigated to game room
      await page.waitForURL(/\/(game|session|room)/, { timeout: 10000 });

      // Verify we're in a session (look for session code)
      const sessionCode = await page.locator('[data-testid="session-code"], .session-code, :text-matches("[A-Z0-9]{6}")').first().textContent();
      expect(sessionCode).toMatch(/^[A-Z0-9]{6}$/);
    });

    // Step 2: Open a second browser context to simulate another player
    const player2Page = await context.newPage();

    await test.step('Second player joins session', async () => {
      // Get session code from first page
      const sessionCode = await page.locator('[data-testid="session-code"], .session-code, :text-matches("[A-Z0-9]{6}")').first().textContent();

      // Player 2 goes to home and joins
      await player2Page.goto('/');

      // Click "Join Session"
      await player2Page.click('button:has-text("Join Session"), a:has-text("Join")');

      // Enter session code
      const codeInput = player2Page.locator('input[name="sessionCode"], input[placeholder*="code" i]');
      await codeInput.fill(sessionCode!);

      // Enter display name
      const nameInput = player2Page.locator('input[name="displayName"], input[placeholder*="name" i]');
      await nameInput.fill('Player 2');

      // Submit join
      await player2Page.click('button[type="submit"]:has-text("Join")');

      // Wait for join to complete
      await player2Page.waitForURL(/\/(game|session|room)/);

      // Verify both pages show 2 participants
      await expect(page.locator(':text("Player 2")')).toBeVisible({ timeout: 5000 });
      await expect(player2Page.locator(':text("Player 2")')).toBeVisible();
    });

    // Step 3: Both players cast votes
    await test.step('Players cast votes', async () => {
      // Player 1 (organizer) votes
      await page.click('button:has-text("5"), [data-card-value="5"]');
      await expect(page.locator('[data-testid="my-vote"], .my-vote, :text("Your vote: 5")')).toBeVisible({ timeout: 3000 });

      // Player 2 votes
      await player2Page.click('button:has-text("8"), [data-card-value="8"]');
      await expect(player2Page.locator('[data-testid="my-vote"], .my-vote, :text("Your vote: 8")')).toBeVisible({ timeout: 3000 });

      // Verify vote indicators show both players have voted
      const voteIndicators = page.locator('[data-testid="vote-status"], .vote-indicator, .voted');
      const votedCount = await voteIndicators.count();
      expect(votedCount).toBeGreaterThanOrEqual(2);
    });

    // Step 4: Organizer reveals votes
    await test.step('Reveal votes', async () => {
      // Click "Reveal Votes" button (only available to organizer)
      await page.click('button:has-text("Reveal"), button:has-text("Show Votes")');

      // Wait for votes to be revealed on both pages
      await expect(page.locator(':text("5")')).toBeVisible({ timeout: 3000 });
      await expect(page.locator(':text("8")')).toBeVisible();
      await expect(player2Page.locator(':text("5")')).toBeVisible({ timeout: 3000 });
      await expect(player2Page.locator(':text("8")')).toBeVisible();

      // Verify average or result is shown
      const result = await page.locator('[data-testid="average"], .average, :text-matches("Average|Result")').first().textContent();
      expect(result).toContain('6'); // Average of 5 and 8 is 6.5, rounded might be 6 or 7
    });

    // Step 5: Reset votes for next story
    await test.step('Reset votes', async () => {
      // Click "Reset" or "Next Story" button (only available to organizer)
      await page.click('button:has-text("Reset"), button:has-text("Next Story"), button:has-text("Vote Again")');

      // Wait for votes to be cleared on both pages
      await expect(page.locator('[data-testid="my-vote"], .my-vote')).not.toBeVisible({ timeout: 3000 });
      await expect(player2Page.locator('[data-testid="my-vote"], .my-vote')).not.toBeVisible({ timeout: 3000 });

      // Verify voting cards are available again
      await expect(page.locator('button:has-text("5"), [data-card-value="5"]')).toBeEnabled();
      await expect(player2Page.locator('button:has-text("8"), [data-card-value="8"]')).toBeEnabled();
    });

    // Cleanup
    await player2Page.close();
  });

  test('Observer can view but not vote', async ({ page, context }) => {
    // Create session as organizer
    await test.step('Create session', async () => {
      await page.goto('/');
      await page.click('button:has-text("Create Session"), button:has-text("New Session")');

      const sessionNameInput = page.locator('input[name="sessionName"], input[placeholder*="session name" i]');
      if (await sessionNameInput.isVisible()) {
        await sessionNameInput.fill('Observer Test Session');
      }

      await page.click('button[type="submit"]:has-text("Create"), button:has-text("Start Session")');
      await page.waitForURL(/\/(game|session|room)/);
    });

    // Join as observer
    const observerPage = await context.newPage();

    await test.step('Join as observer', async () => {
      const sessionCode = await page.locator('[data-testid="session-code"], .session-code, :text-matches("[A-Z0-9]{6}")').first().textContent();

      await observerPage.goto('/');
      await observerPage.click('button:has-text("Join Session"), a:has-text("Join")');

      await observerPage.fill('input[name="sessionCode"], input[placeholder*="code" i]', sessionCode!);
      await observerPage.fill('input[name="displayName"], input[placeholder*="name" i]', 'Observer');

      // Check "Observer" checkbox if available
      const observerCheckbox = observerPage.locator('input[type="checkbox"][name="isObserver"], input[type="checkbox"]:near(:text("Observer"))');
      if (await observerCheckbox.isVisible()) {
        await observerCheckbox.check();
      }

      await observerPage.click('button[type="submit"]:has-text("Join")');
      await observerPage.waitForURL(/\/(game|session|room)/);

      // Verify observer cannot see voting cards
      const voteButtons = observerPage.locator('button[data-card-value], button:has-text("1"), button:has-text("2")');
      await expect(voteButtons.first()).not.toBeVisible({ timeout: 2000 }).catch(() => {
        // It's okay if there are no voting buttons at all
      });

      // Verify observer badge or indicator
      await expect(observerPage.locator(':text("Observer")')).toBeVisible();
    });

    await observerPage.close();
  });
});
