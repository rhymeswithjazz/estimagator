import { test, expect, Page } from '@playwright/test';

async function createGame(page: Page) {
  await page.goto('/');
  await expect(page).toHaveTitle(/Estimagator/);
  await page.getByRole('button', { name: 'Start New Game', exact: true }).click();
  await page.getByPlaceholder('e.g., Riley').fill('Guest Host');
  await page.getByPlaceholder('e.g., Sprint 2 Story Review').fill('Browser test');
  await page.getByRole('button', { name: 'Vote', exact: true }).click();
  await page.getByRole('button', { name: 'Create Game', exact: true }).click();
  await expect(page).toHaveURL(/\/game\/[A-Z0-9]{6}$/);
  await expect(page.getByTestId('vote-card-5')).toBeEnabled();
  return new URL(page.url()).pathname.split('/').pop()!;
}

async function joinGame(page: Page, code: string, name: string, observer = false) {
  await page.goto(`/join/${code}`);
  await page.getByPlaceholder('Enter your name').fill(name);
  if (observer) await page.getByRole('switch').click();
  await page.getByRole('button', { name: 'Join Game', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/game/${code}$`));
}

test('guests create, join, vote, reveal, reconnect and reset without registering', async ({
  page,
  browser,
}) => {
  const code = await createGame(page);
  // A separate browser context gives this participant its own reconnect credential.
  const playerContext = await browser.newContext();
  try {
    const player = await playerContext.newPage();
    await joinGame(player, code, 'Player Two');
    await expect(page.getByText('Player Two', { exact: true })).toBeVisible();
    await page.getByTestId('vote-card-5').click();
    await player.getByTestId('vote-card-8').click();
    await expect(page.getByTestId('my-vote')).toContainText('Your vote: 5');
    await expect(player.getByTestId('my-vote')).toContainText('Your vote: 8');
    await expect(page.getByTestId('vote-average')).toHaveCount(0);
    await expect(player.getByRole('button', { name: 'Reveal Votes', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Reveal Votes', exact: true }).click();
    for (const participant of [page, player]) {
      await expect(participant.getByTestId('vote-average')).toHaveText('6.5');
    }
    await page.reload();
    await expect(page.getByTestId('vote-average')).toHaveText('6.5');
    await page.getByRole('button', { name: 'Vote Again', exact: true }).click();
    for (const participant of [page, player]) {
      await expect(participant.getByTestId('vote-average')).toHaveCount(0);
      await expect(participant.getByTestId('my-vote')).toHaveCount(0);
      await expect(participant.getByTestId('vote-card-5')).toBeEnabled();
    }
    await player.getByTestId('vote-card-3').click();
    await expect(player.getByTestId('my-vote')).toContainText('Your vote: 3');
  } finally {
    await playerContext.close();
  }
});

test('observer can watch revealed results but cannot vote', async ({ page, browser }) => {
  const code = await createGame(page);
  const observerContext = await browser.newContext();
  try {
    const observer = await observerContext.newPage();
    await joinGame(observer, code, 'Guest Observer', true);
    await expect(page.getByTestId('observer-list')).toContainText('Guest Observer');
    await expect(observer.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    await expect(observer.getByTestId(/^vote-card-/)).toHaveCount(0);
    await expect(observer.getByRole('button', { name: 'Reveal Votes', exact: true })).toHaveCount(
      0,
    );
    await page.getByTestId('vote-card-5').click();
    await page.getByRole('button', { name: 'Reveal Votes', exact: true }).click();
    await expect(observer.getByText('Consensus!', { exact: true })).toBeVisible();
    await expect(observer.getByTestId(/^vote-card-/)).toHaveCount(0);
  } finally {
    await observerContext.close();
  }
});
