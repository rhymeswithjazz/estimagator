import { test, expect, Browser, Page } from '@playwright/test';

async function createGame(page: Page, hostName: string): Promise<string> {
  await page.goto('/');
  await expect(page).toHaveTitle(/Estimagator/);
  await page.getByRole('button', { name: 'Start New Game' }).click();
  await page.getByPlaceholder('e.g., Riley').fill(hostName);
  await page.getByRole('button', { name: 'Create Game' }).click();
  await page.waitForURL(/\/game\/[A-Z0-9]{6}$/);

  return page.url().split('/game/')[1];
}

// Each player needs their own context: the app keeps a player's identity for a
// game in localStorage, so a second tab in the same context rejoins as the host.
async function joinGame(
  browser: Browser,
  code: string,
  name: string,
  { observer = false } = {},
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await page.getByPlaceholder('ABC123').fill(code);
  await page.getByRole('button', { name: 'Join Game' }).click();
  await page.waitForURL(/\/join\//);
  await page.getByPlaceholder('Enter your name').fill(name);
  if (observer) {
    await page.getByRole('switch').click();
  }
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/game\//);

  return page;
}

const card = (page: Page, value: string) => page.getByRole('button', { name: value, exact: true });

test.describe('Poker Planning - Happy Path', () => {
  test('Complete voting flow: create → join → vote → reveal → reset', async ({ page, browser }) => {
    const code = await test.step('Create session', () => createGame(page, 'Host'));

    const player2Page = await test.step('Second player joins session', async () => {
      const joined = await joinGame(browser, code, 'Player 2');
      await expect(page.getByText('Player 2')).toBeVisible();
      await expect(joined.getByText('0/2')).toBeVisible();
      return joined;
    });

    await test.step('Players cast votes', async () => {
      await card(page, '5').click();
      await expect(page.getByText('Your vote: 5')).toBeVisible();
      await expect(player2Page.getByText('1/2')).toBeVisible();

      await card(player2Page, '8').click();
      await expect(player2Page.getByText('Your vote: 8')).toBeVisible();
      await expect(page.getByText('All votes in!')).toBeVisible();
    });

    await test.step('Reveal votes', async () => {
      await page.getByRole('button', { name: 'Reveal Votes' }).click();

      for (const player of [page, player2Page]) {
        await expect(player.getByTestId('story-estimate')).toContainText('Average: 6.5');
        await expect(player.getByText('Voting locked - waiting for reset')).toBeVisible();
      }
    });

    await test.step('Reset votes', async () => {
      await page.getByRole('button', { name: 'Vote Again' }).click();

      for (const player of [page, player2Page]) {
        await expect(player.getByText('Select a card to vote')).toBeVisible();
        await expect(player.getByText('0/2')).toBeVisible();
        await expect(card(player, '5')).toBeEnabled();
      }
    });

    await player2Page.context().close();
  });

  test('Observer can view but not vote', async ({ page, browser }) => {
    const code = await test.step('Create session', () => createGame(page, 'Host'));

    const observerPage = await test.step('Join as observer', async () => {
      const joined = await joinGame(browser, code, 'Watcher', { observer: true });

      await expect(joined.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
      await expect(card(joined, '5')).toHaveCount(0);
      await expect(page.getByText('Observers')).toBeVisible();
      await expect(page.getByText('Watcher')).toBeVisible();
      return joined;
    });

    await test.step('Observer sees the revealed vote', async () => {
      await expect(page.getByText('0/1')).toBeVisible();
      await card(page, '5').click();
      await page.getByRole('button', { name: 'Reveal Votes' }).click();

      await expect(observerPage.getByText('Consensus!')).toBeVisible();
    });

    await observerPage.context().close();
  });
});
