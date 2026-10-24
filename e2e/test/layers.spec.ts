import { expect, type Page } from '@playwright/test';
import { cellCenterOf, dragBetweenCells } from './support/board-cells';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { cardOf, createTokenFor, openCard, statusOf } from './support/token-cards';

// Every new token lands at the center of the framed view: cell (10, 6), "Coluna 11, linha 7".
async function createAndPlace(master: Page, name: string, to: [number, number]): Promise<void> {
  await createTokenFor(master, name, 'Caio');
  await dragBetweenCells(master, [10, 6], to);
  await openCard(master, name);
  await expect(cardOf(master, name)).toContainText(`Coluna ${to[0] + 1}, linha ${to[1] + 1}`);
}

async function expectCell(page: Page, name: string, col: number, row: number): Promise<void> {
  await openCard(page, name);
  await expect(cardOf(page, name)).toContainText(`Coluna ${col + 1}, linha ${row + 1}`);
}

// The Baú (Objetos) and Zed (Fundo) are out of the list "Na cena": ] walks the board in reading
// order and says the cell of the token it picks.
async function expectPickedCell(page: Page, name: string, col: number, row: number) {
  await page.getByRole('application', { name: /^Tabuleiro/ }).focus();
  const picked = `${name} selecionado`;
  for (let step = 0; step < 5; step += 1) {
    await page.keyboard.press(']');
    if ((await statusOf(page).textContent())?.startsWith(picked)) break;
  }
  await expect(statusOf(page)).toHaveText(`${picked}, coluna ${col + 1}, linha ${row + 1}`);
}

// A move the server never gets has nothing to wait for: give the table time to answer, then look.
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(500);
}

test('layers: a player never picks what is off the tokens layer, a marquee moves a group, and an F5 keeps it all', async ({
  newPlayerPage,
}) => {
  // Three pages drawing PixiJS without a GPU: on the CI runner this spec went over 120 s (1.1 min locally).
  test.setTimeout(240_000);
  const name = `Mesa camadas ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  for (const [page, who] of [
    [bia, BIA],
    [caio, CAIO],
  ] as const) {
    await signIn(page, who);
    await joinByCodeAndEnter(page, code, admin);
  }
  await enterFromTheList(admin, name);

  // The chest goes on Objetos, in Caio's control: even so he cannot pick it up.
  await admin.keyboard.press('2');
  await expect(admin.getByRole('button', { name: 'Objetos (2)' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await createTokenFor(admin, 'Baú', 'Caio');
  await expectPickedCell(bia, 'Baú', 10, 6);
  await dragBetweenCells(caio, [10, 6], [13, 6]);
  await settle(caio);
  await expectPickedCell(caio, 'Baú', 10, 6);

  await admin.keyboard.press('1');
  await createAndPlace(admin, 'Kael', [3, 3]);
  await createAndPlace(admin, 'Bram', [4, 3]);
  await createAndPlace(admin, 'Zed', [6, 8]);

  // "Mover para camada → Fundo" on Zed: Caio no longer drags him.
  const zed = await cellCenterOf(admin, 6, 8);
  await admin.mouse.click(zed.x, zed.y, { button: 'right' });
  const menu = admin.getByRole('menu', { name: 'Ações de Zed' });
  await menu.getByRole('menuitemradio', { name: 'Fundo' }).click();
  await expect(menu).toBeHidden();
  await settle(caio);
  await dragBetweenCells(caio, [6, 8], [8, 8]);
  await settle(caio);
  await expectPickedCell(caio, 'Zed', 6, 8);

  // Caio draws a rectangle over Kael and Bram and drags Kael: both go, in one move.
  await dragBetweenCells(caio, [2, 2], [5, 4]);
  await caio.getByRole('tab', { name: 'Combate' }).click();
  await expect(caio.getByText('2 selecionados')).toBeVisible();
  await dragBetweenCells(caio, [3, 3], [3, 9]);
  await expectCell(bia, 'Kael', 3, 9);
  await expectCell(bia, 'Bram', 4, 9);

  await bia.reload();
  await expectCell(bia, 'Kael', 3, 9);
  await expectCell(bia, 'Bram', 4, 9);
  await caio.reload();
  await dragBetweenCells(caio, [6, 8], [8, 8]);
  await settle(caio);
  await expectPickedCell(caio, 'Zed', 6, 8);
});
