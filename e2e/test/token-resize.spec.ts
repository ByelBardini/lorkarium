import { expect, type Page } from '@playwright/test';
import { cellCenterOf } from './support/board-cells';
import { BIA } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { cardOf, createTokenFor, openCard } from './support/token-cards';

// The point between two cell centers is the corner (or side) they share.
async function gridPoint(page: Page, col: number, row: number): Promise<{ x: number; y: number }> {
  const before = await cellCenterOf(page, Math.floor(col), Math.floor(row));
  const after = await cellCenterOf(page, Math.floor(col) + 1, Math.floor(row) + 1);
  const cell = { x: after.x - before.x, y: after.y - before.y };
  return {
    x: before.x + (col - Math.floor(col) - 0.5) * cell.x,
    y: before.y + (row - Math.floor(row) - 0.5) * cell.y,
  };
}

async function dragPoint(
  page: Page,
  from: readonly [number, number],
  to: readonly [number, number],
): Promise<void> {
  const start = await gridPoint(page, ...from);
  const end = await gridPoint(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

test('resize by the handles: the master scales by a corner, the player stretches a side, both survive an F5', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const name = `Mesa tamanho ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code);
  await enterFromTheList(admin, name);

  // The Grifo of Bia lands at (10, 6); the master selects it and drags its south-east corner
  // from (11, 7) to (13, 9): a corner keeps the proportion, so it grows to 3 × 3.
  await createTokenFor(admin, 'Grifo', 'Bia');
  const grifo = await cellCenterOf(admin, 10, 6);
  await admin.mouse.click(grifo.x, grifo.y);
  await dragPoint(admin, [11, 7], [13, 9]);
  await openCard(bia, 'Grifo');
  await expect(cardOf(bia, 'Grifo')).toContainText('3 × 3 casas');

  // Bia selects her Grifo and stretches only its east side one cell and a half: 4,5 × 3.
  const onGrifo = await cellCenterOf(bia, 11, 7);
  await bia.mouse.click(onGrifo.x, onGrifo.y);
  await dragPoint(bia, [13, 7.5], [14.5, 7.5]);
  await openCard(admin, 'Grifo');
  await expect(cardOf(admin, 'Grifo')).toContainText('Coluna 11, linha 7 · 4,5 × 3 casas');

  await admin.reload();
  await openCard(admin, 'Grifo');
  await expect(cardOf(admin, 'Grifo')).toContainText('4,5 × 3 casas');
});
