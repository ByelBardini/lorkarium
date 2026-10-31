import { expect, test, type Page } from '@playwright/test';

const SECTION_IDS = [
  'topo',
  'cena',
  'grupo',
  'iniciativa',
  'combate',
  'dados',
  'chat',
  'baixar',
  'perguntas',
] as const;

async function scrollToTracker(page: Page): Promise<void> {
  await page.locator('[data-encounter-tracker]').scrollIntoViewIfNeeded();
}

test('the acts below the fold reveal themselves when scrolled into view', async ({ page }) => {
  await page.goto('/');

  const heading = page.locator('#dados [data-reveal]').first();
  await expect(page.locator('html')).toHaveAttribute('data-motion', '');
  await expect(heading).toHaveCSS('opacity', '0');

  await heading.scrollIntoViewIfNeeded();

  await expect(heading).toHaveAttribute('data-revealed', '');
  await expect(heading).toHaveCSS('opacity', '1');
});

test('the hero map moves with the scroll', async ({ page }) => {
  await page.goto('/');

  await page.mouse.wheel(0, 300);

  await expect(page.locator('[data-scene-layer]').first()).toHaveCSS(
    'transform',
    /matrix\(1, 0, 0, 1, [-\d.]+, [1-9][\d.]*\)/,
  );
});

test('the staged round passes the turn on its own', async ({ page }) => {
  await page.goto('/');

  await scrollToTracker(page);

  await expect(page.locator('[data-encounter-turn]')).toHaveText('Thoren', { timeout: 5_000 });
  await expect(page.locator('li[aria-current="true"]')).toContainText('Thoren');
});

test('pausing the staged round keeps the turn where it is', async ({ page }) => {
  await page.goto('/');
  await scrollToTracker(page);

  const pause = page.getByRole('button', { name: 'Pausar' });
  await pause.click();

  await expect(page.getByRole('button', { name: 'Continuar' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const turn = await page.locator('[data-encounter-turn]').textContent();
  await page.waitForTimeout(4_000);
  await expect(page.locator('[data-encounter-turn]')).toHaveText(turn ?? '');
});

test('the d20 of act V rolls in 3D and shows the total once it settles', async ({ page }) => {
  await page.goto('/');

  const stage = page.locator('[data-dice-stage]');
  await stage.scrollIntoViewIfNeeded();

  await expect(stage.locator('canvas[data-dice-overlay]')).toBeAttached({ timeout: 10_000 });
  await expect(stage.locator('[data-dice-poster]')).toBeHidden();
  await expect(stage.locator('[data-dice-total]')).toHaveText(/^Total \d+$/, { timeout: 10_000 });

  await stage.getByRole('button', { name: 'Rolar o d20' }).click();
  await expect(stage.getByRole('button', { name: 'Rolar o d20' })).toBeDisabled();
  await expect(stage.locator('[data-dice-total]')).toHaveText(/^Total \d+$/, { timeout: 10_000 });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('everything is visible at once and the round stays still', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).not.toHaveAttribute('data-motion');
    await expect(page.locator('#dados [data-reveal]').first()).toHaveCSS('opacity', '1');
    await scrollToTracker(page);
    await expect(page.locator('[data-round-pause]')).toBeHidden();
    await page.waitForTimeout(4_000);
    await expect(page.locator('[data-encounter-turn]')).toHaveText('Ogro das Cinzas');
  });

  test('the dice stage keeps the capture and loads no 3D', async ({ page }) => {
    await page.goto('/');

    const stage = page.locator('[data-dice-stage]');
    await stage.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_500);

    await expect(stage.locator('[data-dice-poster]')).toBeVisible();
    await expect(stage.locator('canvas')).toHaveCount(0);
    await expect(stage.getByRole('button', { name: 'Rolar o d20' })).toBeHidden();
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('every act and the Windows download are visible', async ({ page }) => {
    await page.goto('/');

    for (const id of SECTION_IDS) {
      await expect(page.locator(`section#${id}`)).toBeAttached();
    }
    await expect(page.locator('#dados [data-reveal]').first()).toHaveCSS('opacity', '1');
    await expect(
      page.locator('#topo').getByRole('link', { name: 'Baixar para Windows' }),
    ).toBeVisible();
  });
});
