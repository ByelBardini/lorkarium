import { expect, test, type Page } from '@playwright/test';

const LATEST_RELEASE_API = 'https://api.github.com/repos/ByelBardini/lorkarium/releases/latest';
const INSTALLER_NAME = 'Lorkarium_0.3.1_x64-setup.exe';
const INSTALLER_URL = `https://github.com/ByelBardini/lorkarium/releases/download/desktop-v0.3.1/${INSTALLER_NAME}`;
const RELEASES_PAGE = 'https://github.com/ByelBardini/lorkarium/releases/latest';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const LATEST_RELEASE = {
  tag_name: 'desktop-v0.3.1',
  published_at: '2026-10-20T12:00:00Z',
  assets: [
    { name: INSTALLER_NAME, size: 8_808_038, browser_download_url: INSTALLER_URL },
    { name: `${INSTALLER_NAME}.sig`, size: 420, browser_download_url: `${INSTALLER_URL}.sig` },
  ],
};

async function answerTheRelease(page: Page, status = 200): Promise<void> {
  await page.route(LATEST_RELEASE_API, (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(
        status === 200 ? LATEST_RELEASE : { message: 'API rate limit exceeded' },
      ),
    }),
  );
  await page.route(INSTALLER_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/octet-stream',
      headers: { 'content-disposition': `attachment; filename="${INSTALLER_NAME}"` },
      body: 'MZ',
    }),
  );
}

test('the hero shows the version and size of the latest release', async ({ page }) => {
  await answerTheRelease(page);

  await page.goto('/');

  const hero = page.locator('#topo');
  await expect(hero.getByText('Versão 0.3.1')).toBeVisible();
  await expect(hero.getByText('8,4 MB')).toBeVisible();
});

test('Baixar opens the thank-you page and downloads the installer', async ({ page }) => {
  await answerTheRelease(page);
  await page.goto('/');

  const download = page.waitForEvent('download');
  await page.locator('#topo').getByRole('link', { name: 'Baixar para Windows' }).click();

  expect((await download).suggestedFilename()).toBe(INSTALLER_NAME);
  await expect(page).toHaveURL(/\/obrigado\/$/);
  await expect(page.getByRole('heading', { name: 'Seu download está começando' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Baixar manualmente' })).toHaveAttribute(
    'href',
    INSTALLER_URL,
  );
});

test('with the GitHub API refusing, downloading falls back to the releases page', async ({
  page,
}) => {
  await answerTheRelease(page, 403);
  await page.goto('/');

  await expect(page.locator('#topo').getByText('Windows 10 ou 11 · 64 bits')).toBeVisible();
  await page.locator('#topo').getByRole('link', { name: 'Baixar para Windows' }).click();

  await expect(
    page.getByRole('status').filter({ hasText: 'Não foi possível consultar' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Baixar manualmente' })).toHaveAttribute(
    'href',
    RELEASES_PAGE,
  );
});

test('a Mac visitor is pointed to the browser version', async ({ browser }) => {
  const context = await browser.newContext({ userAgent: MAC_SAFARI });
  const page = await context.newPage();
  await answerTheRelease(page);

  await page.goto('/');

  await expect(page.getByRole('link', { name: 'Abrir o Lorkarium no navegador' })).toHaveAttribute(
    'href',
    'https://mesa.lorkarium.test/login',
  );
  await context.close();
});

test('the page never scrolls sideways on a 375px phone', async ({ page }) => {
  await answerTheRelease(page);
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto('/');

  // A string, like the canvas specs: the e2e tsconfig has no DOM lib.
  const widths = await page.evaluate<number[]>(
    '[document.documentElement.scrollWidth, innerWidth]',
  );
  expect(widths[0]).toBe(widths[1]);
  await expect(page.locator('header').getByRole('link', { name: 'Baixar' })).toBeVisible();
});
