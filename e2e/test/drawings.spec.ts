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

async function expectCell(page: Page, name: string, col: number, row: number): Promise<void> {
  await openCard(page, name);
  await expect(cardOf(page, name)).toContainText(`Coluna ${col + 1}, linha ${row + 1}`);
}

test('drawings, copy and undo: drawn for everyone, moved by the master, pasted, undone, and refused when stale', async ({
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
    await joinByCodeAndEnter(page, code);
  }
  await enterFromTheList(admin, name);

  // Bia draws a filled square from the middle of (2, 2) to the middle of (4, 4): corner (2.5, 2.5).
  await drawSquare(bia, [2, 2], [4, 4]);
  await expect(drawingsOf(admin)).toHaveText(['Quadrado, coluna 3, linha 3']);

  // The master drags it three cells right; Bia sees it there, and after an F5 too.
  await admin.getByRole('button', { name: 'Selecionar (V)' }).click();
  await dragBetweenCells(admin, [3, 3], [6, 3]);
  await expect(drawingsOf(bia)).toHaveText(['Quadrado, coluna 6, linha 3']);
  await bia.reload();
  await expect(drawingsOf(bia)).toHaveText(['Quadrado, coluna 6, linha 3']);

  // A Goblin for Caio lands at (10, 6); the master copies it and pastes it under the cursor.
  await createTokenFor(admin, 'Goblin', 'Caio');
  const goblin = await cellCenterOf(admin, 10, 6);
  await admin.mouse.click(goblin.x, goblin.y);
  await admin.keyboard.press('Control+c');
  await expect(statusOf(admin)).toHaveText('1 item copiado.');
  const target = await cellCenterOf(admin, 14, 3);
  await admin.mouse.move(target.x, target.y);
  await admin.keyboard.press('Control+v');
  for (const page of [admin, bia, caio]) await expect(goblinsOf(page)).toHaveCount(2);

  // Ctrl+Z undoes the paste for the three of them.
  await admin.keyboard.press('Control+z');
  for (const page of [admin, bia, caio]) await expect(goblinsOf(page)).toHaveCount(1);

  // On Fundo the master draws again; back on Tokens it is not picked up, so Delete keeps it.
  await admin.keyboard.press('3');
  await drawSquare(admin, [12, 8], [14, 10]);
  await expect(drawingsOf(caio)).toHaveCount(2);
  await admin.keyboard.press('1');
  await admin.getByRole('button', { name: 'Selecionar (V)' }).click();
  const onBackground = await cellCenterOf(admin, 13, 9);
  await admin.mouse.click(onBackground.x, onBackground.y);
  await admin.keyboard.press('Delete');
  await admin.waitForTimeout(500);
  await expect(drawingsOf(caio)).toHaveCount(2);

  // The master moves the Goblin, Caio moves it after: the master's Ctrl+Z is refused and it stays.
  await dragBetweenCells(admin, [10, 6], [10, 9]);
  await expectCell(caio, 'Goblin', 10, 9);
  await dragBetweenCells(caio, [10, 9], [12, 9]);
  await expectCell(admin, 'Goblin', 12, 9);
  await admin.keyboard.press('Control+z');
  await expect(statusOf(admin)).toHaveText(STALE_UNDO);
  await expectCell(bia, 'Goblin', 12, 9);
});
