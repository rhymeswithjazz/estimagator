import { test, expect, Page } from '@playwright/test';

async function createGame(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start New Game', exact: true }).click();
  await page.getByPlaceholder('e.g., Riley').fill('Guest Host');
  await page.getByRole('button', { name: 'Vote', exact: true }).click();
  await page.getByTestId('card-back-option-art-deco').click();
  await page.getByRole('button', { name: 'Create Game', exact: true }).click();
  await expect(page).toHaveURL(/\/game\/[A-Z0-9]{6}$/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

test('host picks a card back at creation and changes it live', async ({ page, browser }) => {
  const code = await createGame(page);
  const playerContext = await browser.newContext();
  try {
    const player = await playerContext.newPage();
    await player.goto(`/join/${code}`);
    await player.getByPlaceholder('Enter your name').fill('Player Two');
    await player.getByRole('button', { name: 'Join Game', exact: true }).click();
    await expect(player).toHaveURL(new RegExp(`/game/${code}$`));

    await player.getByTestId('vote-card-5').click();
    for (const participant of [page, player]) {
      await expect(participant.getByTestId('table-card-back')).toHaveAttribute(
        'data-card-back',
        'art-deco',
      );
    }

    await page.getByTitle('Session Settings').click();
    await page.getByTestId('card-back-option-scout-night').click();
    for (const participant of [page, player]) {
      await expect(participant.getByTestId('table-card-back')).toHaveAttribute(
        'data-card-back',
        'scout-night',
      );
    }
    await expect(player.getByTestId('my-vote')).toContainText('Your vote: 5');

    await player.reload();
    await expect(player.getByTestId('table-card-back')).toHaveAttribute(
      'data-card-back',
      'scout-night',
    );
  } finally {
    await playerContext.close();
  }
});
