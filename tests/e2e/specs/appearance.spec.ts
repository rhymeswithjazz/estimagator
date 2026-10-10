import { test, expect } from '@playwright/test';

const routes = [
  ['home', '/'],
  ['login', '/login'],
  ['register', '/register'],
  ['forgot', '/forgot-password'],
  ['reset', '/reset-password?token=visual-test'],
  ['privacy', '/privacy'],
  ['verify', '/verify-email'],
] as const;

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`branding and layout at ${width}px in ${theme} mode`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript((value) => localStorage.setItem('poker-points-theme', value), theme);
      for (const [name, url] of routes) {
        await page.goto(url);
        const brand = page.locator('app-brand');
        await expect(brand).toBeVisible();
        await expect(brand.getByRole('img', { name: 'Estimagator' })).toBeVisible();
        await expect(brand.locator('img')).toHaveJSProperty('complete', true);
        expect(
          await brand.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth),
        ).toBeGreaterThan(0);
        await expect(page.locator('html')).toHaveClass(
          theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/,
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        await page.evaluate(() => document.fonts.ready);
        // Retain reviewable desktop/mobile captures without OS-dependent pixel baselines.
        if (testInfo.project.name === 'chromium') {
          await page.screenshot({
            path: testInfo.outputPath(`${name}.png`),
            fullPage: true,
            animations: 'disabled',
          });
        }
        if (name === 'home') {
          const start = page.getByRole('button', { name: 'Start New Game', exact: true });
          await expect(start).toHaveCSS('border-radius', '12px');
          await expect(start).toHaveCSS('background-image', /linear-gradient/);
          await start.click();
          await expect(
            page.getByRole('button', { name: 'Create Game', exact: true }),
          ).toBeVisible();
          const field = page.getByPlaceholder('e.g., Riley');
          await expect(field).toHaveCSS(
            'background-color',
            theme === 'dark' ? 'rgb(31, 41, 55)' : 'rgb(249, 250, 251)',
          );
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
          if (testInfo.project.name === 'chromium') {
            await page.screenshot({
              path: testInfo.outputPath('create.png'),
              fullPage: true,
              animations: 'disabled',
            });
          }
        }
      }
    });
  }
}
