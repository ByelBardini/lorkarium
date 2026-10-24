import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf, dragBetweenCells } from './support/board-cells';
import { BIA } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';

// The canvas has no DOM: the board says its areas of effect in a hidden list.
function areasOf(page: Page): Locator {
  return page.getByRole('list', { name: 'Áreas na cena' }).getByRole('listitem');
}

// The point between two cell centers is the corner (or side) they share.
async function gridPoint(page: Page, col: number, row: number): Promise<{ x: number; y: number }> {
  const before = await cellCenterOf(page, Math.floor(col), Math.floor(row));
  const after = await cellCenterOf(page, Math.floor(col) + 1, Math.floor(row) + 1);
  return {
    x: before.x + (col - Math.floor(col) - 0.5) * (after.x - before.x),
    y: before.y + (row - Math.floor(row) - 0.5) * (after.y - before.y),
  };
}

async function clickCell(page: Page, col: number, row: number): Promise<void> {
  const center = await cellCenterOf(page, col, row);
  await page.mouse.click(center.x, center.y);
}

test('areas of effect live: drawn by a player, stretched by its handle, deleted by the master, kept on F5 and undone', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const name = `Mesa magia ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, name);

  // Bia picks a diagonal cone in ember and drags from the middle of (6, 6) toward (9, 9): it leaves
  // the corner (7, 7) facing down right with a reach of 4. Past column 5: the style panel floats
  // over the first columns and would take the press.
  await bia.getByRole('button', { name: 'Área de efeito (M)' }).click();
  const panel = bia.getByRole('region', { name: 'Estilo da área' });
  await panel.getByRole('radio', { name: 'Cone diagonal' }).click();
  await panel
    .getByRole('radiogroup', { name: 'Cor' })
    .getByRole('radio', { name: 'Brasa' })
    .click();
  await dragBetweenCells(bia, [6, 6], [9, 9]);
  await expect(areasOf(admin)).toHaveText([
    'Cone diagonal, Brasa, 4 casas · 6 m, de Bia, coluna 7, linha 7',
  ]);

  // Bia selects her cone and drags the east square of its box from (11, 7) to (13, 7): reach 6.
  await bia.getByRole('button', { name: 'Selecionar (V)' }).click();
  await clickCell(bia, 7, 7);
  const east = await gridPoint(bia, 11, 7);
  const farther = await gridPoint(bia, 13, 7);
  await bia.mouse.move(east.x, east.y);
  await bia.mouse.down();
  await bia.mouse.move(farther.x, farther.y, { steps: 8 });
  await bia.mouse.up();
  await expect(areasOf(admin)).toHaveText([/^Cone diagonal, Brasa, 6 casas · 9 m, de Bia/]);

  // The master selects it and deletes it; it is gone for Bia, and stays gone after her F5.
  await admin.getByRole('button', { name: 'Selecionar (V)' }).click();
  await clickCell(admin, 7, 7);
  await admin.keyboard.press('Delete');
  await expect(areasOf(bia)).toHaveCount(0);
  await bia.reload();
  await expect(bia.getByRole('list', { name: 'Áreas na cena' })).toBeAttached();
  await expect(areasOf(bia)).toHaveCount(0);

  // Ctrl+Z of the master creates it again, as it was when deleted; the author is whoever asks
  // (the server never takes it from the payload, §7.3), so now it is the master's.
  await admin.keyboard.press('Control+z');
  await expect(areasOf(bia)).toHaveText([
    'Cone diagonal, Brasa, 6 casas · 9 m, de admin, coluna 7, linha 7',
  ]);
});
