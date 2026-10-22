import { expect, type Locator, type Page } from '@playwright/test';

/** The status line of the board, where moves, selections and refusals are said. */
export function statusOf(page: Page): Locator {
  return page.getByRole('status', { name: 'Status do tabuleiro' });
}

/** The token lines under "Na cena" (one per token this viewer sees; the side headings and a
 *  group's folded line are not counted). */
export function sceneTokensOf(page: Page): Locator {
  return page.getByRole('list', { name: 'Na cena' }).locator('button[aria-pressed]');
}

/** The detail of the selected token at the foot of the panel (open it first with `openCard`). */
export function cardOf(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name: 'Token selecionado' })
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

/** Selects `name` under "Na cena" (tab "Combate"), unless it is already selected, and waits for
 *  its detail at the foot of the panel.
 *
 *  Example: `await openCard(bia, 'Lyra'); await expect(cardOf(bia, 'Lyra')).toContainText('Coluna 5')` */
export async function openCard(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Combate' }).click();
  const row = page
    .getByRole('list', { name: 'Na cena' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
  if ((await row.getAttribute('aria-pressed')) !== 'true') await row.click();
  await expect(cardOf(page, name)).toBeVisible();
}

/** Presses the player's button in "Quem controla" of the token dialog (nobody pressed is the
 *  master's). */
export async function chooseController(dialog: Locator, player: string): Promise<void> {
  await dialog.getByRole('button', { name: player, exact: true }).click();
}

/** "Novo token" with a name, one player in control and a PV bar ("Nova barra": PV 10 / 10,
 *  only its controllers see it), at the center of the view.
 *
 *  Example: `await createTokenWithPvFor(admin, 'Lyra', 'Bia')` */
export async function createTokenWithPvFor(
  master: Page,
  name: string,
  player: string,
): Promise<void> {
  await master.getByRole('button', { name: 'Novo token' }).click();
  const dialog = master.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  await chooseController(dialog, player);
  await dialog.getByRole('tab', { name: /^Barras/ }).click();
  await dialog.getByRole('button', { name: 'Nova barra' }).click();
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

/** "Novo token" with a name and one player in control, at the center of the view. */
export async function createTokenFor(master: Page, name: string, player: string): Promise<void> {
  await master.getByRole('button', { name: 'Novo token' }).click();
  const dialog = master.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  await chooseController(dialog, player);
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}
