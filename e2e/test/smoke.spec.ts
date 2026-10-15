import { expect, test } from '@playwright/test';

test('the client home page answers 200 with no page error nor console error while loading', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  const response = await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(response?.status()).toBe(200);
  expect(problems).toEqual([]);
});

test('GET /api/health through the client origin reaches the server and its database', async ({
  page,
}) => {
  const response = await page.request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});
