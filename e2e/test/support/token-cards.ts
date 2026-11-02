import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf } from './board-cells';

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

/** "Novo token" with a name and one player in control, at the center of the view. */
export async function createTokenFor(master: Page, name: string, player: string): Promise<void> {
  await master.getByRole('button', { name: 'Novo token' }).click();
  const dialog = master.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  await chooseController(dialog, player);
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

/** The master's "Ligar a personagem… → <character>" on the token born at the center cell
 *  (10, 6), confirmed in "Ligar a <character>?": the token wears the character (name, bars,
 *  conditions and control, valid in every grid). A player's character is named after the nick.
 *
 *  Example: `await linkCenterTokenToCharacter(admin, 'Lobo', 'Bia')` */
export async function linkCenterTokenToCharacter(
  master: Page,
  token: string,
  character: string,
): Promise<void> {
  const center = await cellCenterOf(master, 10, 6);
  await master.mouse.click(center.x, center.y, { button: 'right' });
  const menu = master.getByRole('menu', { name: `Ações de ${token}` });
  await menu.getByRole('menuitem', { name: 'Ligar a personagem…' }).click();
  await master.getByRole('menuitem', { name: character, exact: true }).click();
  const question = master.getByRole('alertdialog', { name: `Ligar a ${character}?` });
  await question.getByRole('button', { name: 'Ligar', exact: true }).click();
  await expect(question).toBeHidden();
}

/** `player`'s character on a token at the center cell, named `name` and with a PV bar (10 / 10,
 *  only its controllers see it): "Novo token", linked to the character (still named after the
 *  nick), then the master's "Editar token" renames it and adds "Nova barra" — both on the
 *  character, so the card of "Na mesa" reads `name` too.
 *
 *  Example: `await createCharacterTokenWithPv(admin, 'Lyra', 'Bia')` */
export async function createCharacterTokenWithPv(
  master: Page,
  name: string,
  player: string,
): Promise<void> {
  await createTokenFor(master, name, player);
  await linkCenterTokenToCharacter(master, name, player);
  await openCard(master, player);
  await cardOf(master, player).getByRole('button', { name: 'Editar token' }).click();
  const dialog = master.getByRole('dialog', { name: 'Editar token' });
  await expect(dialog).toContainText(`No personagem ${player} · vale em todo grid`);
  await dialog.getByLabel('Nome').fill(name);
  await dialog.getByRole('tab', { name: /^Barras/ }).click();
  await dialog.getByRole('button', { name: 'Nova barra' }).click();
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
  await openCard(master, name);
  await expect(cardOf(master, name)).toContainText('10 / 10');
}
