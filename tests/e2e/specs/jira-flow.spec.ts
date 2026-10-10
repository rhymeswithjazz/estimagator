import { test, expect, Page } from '@playwright/test';

const user = {
  id: 'host',
  email: 'host@example.test',
  displayName: 'Host',
  emailVerified: true,
  role: 'User',
  createdAt: '2026-01-01',
};
const participant = {
  id: 'host-participant',
  displayName: 'Host',
  isOrganizer: true,
  isObserver: false,
  isConnected: true,
};
const baseStory = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Imported Jira story',
  url: 'https://example.atlassian.net/browse/TEAM-1',
  status: 'completed',
  finalScore: 5.5,
  agreedEstimate: null as number | null,
  estimateRevision: 0,
  jira: {
    siteId: 'site',
    issueId: '100',
    key: 'TEAM-1',
    fieldId: 'customfield_42',
    publishStatus: 'not_published',
    message: null as string | null,
    conflictValue: null as number | null,
    retryAfter: null,
    publishedAt: null as string | null,
    publishedValue: null as number | null,
  },
};
async function authenticate(page: Page) {
  await page.addInitScript(
    ({ user, participant }) => {
      localStorage.setItem(
        'estimagator-auth',
        JSON.stringify({
          user,
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          expiresAt: '2099-01-01',
        }),
      );
      localStorage.setItem(
        'poker-points-session-JIRA01',
        JSON.stringify({
          sessionCode: 'JIRA01',
          participantId: participant.id,
          displayName: 'Host',
          isObserver: false,
        }),
      );
    },
    { user, participant },
  );
}

test('host confirms, resolves a Jira conflict, reconnects and retries from history', async ({
  page,
}) => {
  await authenticate(page);
  const story = structuredClone(baseStory);
  let publishCount = 0;
  let connected = false;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (json: unknown) => route.fulfill({ json });
    if (path.endsWith('/enabled')) return respond({ enabled: true });
    if (path.endsWith('/connection'))
      return respond({ connected, reconnectRequired: !connected, sites: [] });
    if (path.endsWith('/authorize')) {
      connected = true;
      return respond({ url: '/session/JIRA01/history?jira=connected' });
    }
    if (path.endsWith('/history'))
      return respond({
        id: 'session',
        accessCode: 'JIRA01',
        name: 'Jira planning',
        deckType: 'fibonacci',
        isActive: false,
        createdAt: '2026-01-01',
        participants: [participant],
        stories: [{ ...story, votes: [] }],
        canManageEstimates: true,
      });
    if (path.endsWith('/estimate')) {
      const request = route.request().postDataJSON();
      expect(request.expectedRevision).toBe(story.estimateRevision);
      story.agreedEstimate = request.value;
      story.estimateRevision++;
      return respond(story);
    }
    if (path.endsWith('/jira/publish')) {
      publishCount++;
      if (!connected)
        story.jira = {
          ...story.jira,
          publishStatus: 'reconnect_required',
          message: 'Reconnect your Jira account.',
        };
      else if (!route.request().postDataJSON().replace)
        story.jira = {
          ...story.jira,
          publishStatus: 'conflict',
          conflictValue: 8,
          message: 'The Jira estimate changed.',
        };
      else
        story.jira = {
          ...story.jira,
          publishStatus: 'published',
          conflictValue: null,
          message: null,
          publishedValue: story.agreedEstimate,
          publishedAt: '2026-01-01T12:00:00Z',
        };
      return respond(story);
    }
    return respond([]);
  });
  await page.goto('/session/JIRA01/history');
  await expect(page.getByTestId('agreed-estimate')).toHaveText('Not confirmed');
  await expect(page.getByTestId('publish-jira')).toBeDisabled();
  await page.getByTestId('estimate-input').fill('5');
  await page.getByTestId('confirm-estimate').click();
  await expect(page.getByTestId('agreed-estimate')).toHaveText('5');
  expect(publishCount).toBe(0);
  await page.getByTestId('publish-jira').click();
  await expect(page.getByTestId('jira-publish-status')).toContainText('Reconnect required');
  await page.locator('app-story-estimate').getByRole('button', { name: 'Reconnect Jira' }).click();
  await expect(page).toHaveURL(/jira=connected/);
  await page.getByTestId('publish-jira').click();
  await expect(page.getByText('Jira currently has 8.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Replace Jira estimate' }).click();
  await expect(page.getByTestId('jira-publish-status')).toContainText('Published');
  await page.reload();
  await expect(page.getByTestId('agreed-estimate')).toHaveText('5');
  await expect(page.getByTestId('jira-publish-status')).toContainText('Published');
  await page.screenshot({ path: test.info().outputPath('jira-history.png'), fullPage: true });
});

test('participants view estimates without edit or publishing controls', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/**', (route) =>
    route.fulfill({
      json: route.request().url().endsWith('/enabled')
        ? { enabled: true }
        : {
            id: 'session',
            accessCode: 'JIRA01',
            name: 'Jira planning',
            deckType: 'fibonacci',
            isActive: false,
            createdAt: '2026-01-01',
            participants: [participant],
            stories: [{ ...baseStory, agreedEstimate: 5, votes: [] }],
            canManageEstimates: false,
          },
    }),
  );
  await page.goto('/session/JIRA01/history');
  await expect(page.getByTestId('agreed-estimate')).toHaveText('5');
  await expect(page.getByTestId('confirm-estimate')).toHaveCount(0);
  await expect(page.getByTestId('publish-jira')).toHaveCount(0);
});

test('host searches Jira and imports selected issues into the live queue', async ({ page }) => {
  await authenticate(page);
  let sendEvent: (target: string, data: unknown) => void = () => {};
  const queued = { ...baseStory, status: 'pending', finalScore: null };
  const current = {
    id: 'active',
    title: 'Current story',
    url: null,
    status: 'active',
    finalScore: null,
  };
  await page.routeWebSocket('**/hubs/poker**', (ws) => {
    sendEvent = (target, data) =>
      ws.send(JSON.stringify({ type: 1, target, arguments: [data] }) + '\u001e');
    ws.onMessage((message) => {
      for (const text of String(message).split('\u001e').filter(Boolean)) {
        const msg = JSON.parse(text);
        if (msg.protocol) {
          ws.send('{}\u001e');
          continue;
        }
        if (msg.type !== 1) continue;
        const result =
          msg.target === 'JoinSession'
            ? { participant, reconnectToken: null }
            : msg.target === 'GetStoryQueue'
              ? []
              : msg.target === 'GetSessionState'
                ? {
                    session: {
                      id: 'session',
                      accessCode: 'JIRA01',
                      name: 'Planning',
                      deckType: 'fibonacci',
                      timerDurationSeconds: 120,
                      isActive: true,
                      createdAt: '2026-01-01',
                      participants: [participant],
                      currentStory: current,
                    },
                    currentStory: current,
                    participants: [participant],
                    voteStatuses: [],
                    revealedVotes: null,
                    activeTimer: null,
                  }
                : null;
        ws.send(JSON.stringify({ type: 3, invocationId: msg.invocationId, result }) + '\u001e');
      }
    });
  });
  await page.route('**/hubs/poker/negotiate*', (route) =>
    route.fulfill({
      json: {
        negotiateVersion: 1,
        connectionId: 'test',
        connectionToken: 'test',
        availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text'] }],
      },
    }),
  );
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (json: unknown) => route.fulfill({ json });
    if (path.endsWith('/enabled')) return respond({ enabled: true });
    if (path.endsWith('/connection'))
      return respond({
        connected: true,
        reconnectRequired: false,
        sites: [{ id: 'site', name: 'Example Jira', url: 'https://example.atlassian.net' }],
      });
    if (path.endsWith('/suggestions')) {
      const query = new URL(route.request().url()).searchParams.get('query')!.toLowerCase();
      return respond([
        { id: '100', key: 'TEAM-1', summary: queued.title },
        { id: '200', key: 'TEAM-2', summary: 'Another story to choose' },
      ].filter(issue => `${issue.key} ${issue.summary}`.toLowerCase().includes(query)));
    }
    if (path.endsWith('/projects'))
      return respond({ values: [{ id: '10', key: 'TEAM', name: 'Team' }], isLast: true });
    if (path.endsWith('/search'))
      return respond({
        issues: [
          {
            id: '100',
            key: 'TEAM-1',
            summary: queued.title,
            status: 'To Do',
            projectId: '10',
            issueTypeId: '20',
            fieldId: 'customfield_42',
            estimate: 3,
            fields: [{ id: 'customfield_42', name: 'Story Points' }],
            unavailableReason: null,
          },
        ],
        nextPageToken: null,
      });
    if (path.endsWith('/jira/import')) {
      expect(route.request().postDataJSON().issues).toEqual([
        { issueId: '100', fieldId: 'customfield_42' },
      ]);
      sendEvent('StoryQueueUpdated', [queued]);
      return respond({ imported: [queued], skipped: [] });
    }
    return respond([]);
  });
  await page.goto('/game/JIRA01');
  await page.getByTitle('Session Settings', { exact: true }).click();
  await page.getByTestId('jira-import-open').click();
  await expect(page.getByRole('option', { name: /TEAM-2 Another/ })).toBeVisible();
  await page.getByTestId('jira-issue-key').fill('team-1');
  await expect(page.getByRole('option', { name: /TEAM-2 Another/ })).toHaveCount(0);
  const suggestion = page.getByRole('option', { name: /TEAM-1 Imported Jira story/ });
  await expect(suggestion).toBeVisible();
  await expect(suggestion.locator('[title]')).toHaveAttribute('title', 'Imported Jira story');
  await page.screenshot({ path: test.info().outputPath('jira-autocomplete.png'), fullPage: true, animations: 'disabled' });
  await page.getByTestId('jira-issue-key').press('ArrowDown');
  await page.getByTestId('jira-issue-key').press('Enter');
  await expect(page.getByTestId('jira-select-TEAM-1')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('jira-search-light.png'), fullPage: true, animations: 'disabled' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.screenshot({ path: test.info().outputPath('jira-search-dark.png'), fullPage: true, animations: 'disabled' });
  await page.getByTestId('jira-select-TEAM-1').check();
  await page.getByTestId('jira-import-selected').click();
  await expect(page.getByText('1 imported, 0 skipped.')).toBeVisible();
  await page.getByRole('button', { name: 'Close Jira import', exact: true }).click();
  await expect(
    page.locator('app-settings-panel').getByText('Imported Jira story', { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('jira-import.png'), fullPage: true });
});
