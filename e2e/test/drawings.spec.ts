import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf, dragBetweenCells } from './support/board-cells';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { cardOf, createTokenFor, openCard, statusOf } from './support/token-cards';

const STALE_UNDO = 'Alguém mexeu nisso depois; não dá para desfazer.';

// The canvas has no DOM: the board says its drawings in a hidden list, kind and corner cell.
function drawingsOf(page: Page): Locator {
  return page.getByRole('list', { name: 'Desenhos na cena' }).getByRole('listitem');
}

function goblinsOf(page: Page): Locator {
  return page.getByRole('list', { name: 'Na cena' }).getByRole('button', { name: /^Goblin/ });
}

async function drawSquare(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.getByRole('button', { name: 'Desenhar (B)' }).click();
  const panel = page.getByRole('region', { name: 'Estilo do desenho' });
  await panel.getByRole('radio', { name: 'Quadrado' }).click();
  await panel
    .getByRole('radiogroup', { name: 'Preenchimento' })
    .getByRole('radio', { name: 'Brasa' })
    .click();
  await dragBetweenCells(page, from, to);
}

// Drawings live on their own layer: only the draw tool in Selecionar takes them.
async function pickDrawings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Desenhar (B)' }).click();
  await page
    .getByRole('region', { name: 'Estilo do desenho' })
    .getByRole('radio', { name: 'Selecionar' })
    .click();
}

async function expectCell(page: Page, name: string, col: number, row: number): Promise<void> {
  await openCard(page, name);
  await expect(cardOf(page, name)).toContainText(`Coluna ${col + 1}, linha ${row + 1}`);
}

test('drawings, copy and undo: drawn for everyone, on their own layer, pasted, undone, and refused when stale', async ({
  newPlayerPage,
}) => {
  // Three pages drawing PixiJS without a GPU, as in the layers spec.
  test.setTimeout(240_000);
  const name = `Mesa desenho ${Date.now()}`;
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

  // Bia draws a filled square from the middle of (5, 2) to the middle of (7, 4): corner (5.5, 2.5).
  // Past column 4: the style panel floats over the first columns and would take the press.
  await drawSquare(bia, [5, 2], [7, 4]);
  await expect(drawingsOf(admin)).toHaveText(['Quadrado, coluna 6, linha 3']);

  // The master takes it with Desenhar → Selecionar and drags it three cells right; Bia sees it
  // there, and after an F5 too.
  await pickDrawings(admin);
  await dragBetweenCells(admin, [6, 3], [9, 3]);
  await expect(drawingsOf(bia)).toHaveText(['Quadrado, coluna 9, linha 3']);
  await bia.reload();
  await expect(drawingsOf(bia)).toHaveText(['Quadrado, coluna 9, linha 3']);

  // A Goblin for Caio lands at (10, 6); the master copies it and pastes it under the cursor.
  await createTokenFor(admin, 'Goblin', 'Caio');
  await admin.getByRole('button', { name: 'Selecionar (V)' }).click();
  const goblin = await cellCenterOf(admin, 10, 6);
  await admin.mouse.click(goblin.x, goblin.y);
  await admin.keyboard.press('Control+c');
  await expect(statusOf(admin)).toHaveText('1 item copiado.');
  const target = await cellCenterOf(admin, 14, 3);
  await admin.mouse.move(target.x, target.y);
  await admin.keyboard.press('Control+v');
  // "Na cena" lives on the "Combate" tab; entering the table opens "Na mesa".
  for (const page of [admin, bia, caio]) await page.getByRole('tab', { name: 'Combate' }).click();
  for (const page of [admin, bia, caio]) await expect(goblinsOf(page)).toHaveCount(2);

  // Ctrl+Z undoes the paste for the three of them.
  await admin.keyboard.press('Control+z');
  for (const page of [admin, bia, caio]) await expect(goblinsOf(page)).toHaveCount(1);

  // The master draws a square under the Goblin, corner (9.5, 5.5). With Desenhar → Selecionar,
  // dragging it from the Goblin's cell takes the square only: the Goblin stays at (10, 6).
  await drawSquare(admin, [9, 5], [11, 7]);
  await expect(drawingsOf(caio)).toHaveText([
    'Quadrado, coluna 9, linha 3',
    'Quadrado, coluna 10, linha 6',
  ]);
  await pickDrawings(admin);
  await dragBetweenCells(admin, [10, 6], [12, 6]);
  await expect(drawingsOf(caio)).toHaveText([
    'Quadrado, coluna 9, linha 3',
    'Quadrado, coluna 12, linha 6',
  ]);
  await expectCell(caio, 'Goblin', 10, 6);

  // With Selecionar, a box over the Goblin and the square takes the Goblin only: dragging it
  // leaves the square where it is.
  await admin.getByRole('button', { name: 'Selecionar (V)' }).click();
  await dragBetweenCells(admin, [8, 5], [13, 8]);

  // The master moves the Goblin, Caio moves it after: the master's Ctrl+Z is refused and it stays.
  await dragBetweenCells(admin, [10, 6], [10, 9]);
  await expectCell(caio, 'Goblin', 10, 9);
  await expect(drawingsOf(caio)).toHaveText([
    'Quadrado, coluna 9, linha 3',
    'Quadrado, coluna 12, linha 6',
  ]);
  await dragBetweenCells(caio, [10, 9], [12, 9]);
  await expectCell(admin, 'Goblin', 12, 9);
  await admin.keyboard.press('Control+z');
  await expect(statusOf(admin)).toHaveText(STALE_UNDO);
  await expectCell(bia, 'Goblin', 12, 9);
});
