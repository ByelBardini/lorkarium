import { expect, type Page } from '@playwright/test';
import { cellCenterOf, dragBetweenCells } from './support/board-cells';
import { BIA } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { cardOf, createTokenFor, openCard } from './support/token-cards';

async function setFreeMovement(admin: Page, checked: boolean): Promise<void> {
  await admin.getByRole('button', { name: 'Configurar cena' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Configurar cena' });
  await dialog.getByRole('checkbox', { name: 'Movimento livre' }).setChecked(checked);
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

// A token held by its center lands with its origin where the pointer is, half a cell before it.
async function dragTokenOffTheCells(
  page: Page,
  from: readonly [number, number],
  [col, row]: readonly [number, number],
): Promise<void> {
  const start = await cellCenterOf(page, ...from);
  const cellStart = await cellCenterOf(page, Math.floor(col), Math.floor(row));
  const cellEnd = await cellCenterOf(page, Math.floor(col) + 1, Math.floor(row) + 1);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    cellStart.x + (col - Math.floor(col)) * (cellEnd.x - cellStart.x),
    cellStart.y + (row - Math.floor(row)) * (cellEnd.y - cellStart.y),
    { steps: 8 },
  );
  await page.mouse.up();
}

test('free movement: the token stays where it was dropped for everyone, and snaps again once it is off', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const name = `Mesa livre ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, name);

  await createTokenFor(admin, 'Grifo', 'Bia');
  await setFreeMovement(admin, true);

  // A pixel of the fitted board is a little over 1/64 of a cell: the second decimal may vary.
  const offTheCells = /Coluna 13,[23]\d?, linha 8,[12]\d? /;
  await openCard(admin, 'Grifo');
  await openCard(bia, 'Grifo');
  await dragTokenOffTheCells(bia, [10, 6], [12.3, 7.2]);
  await expect(cardOf(bia, 'Grifo')).toContainText(offTheCells);
  await expect(cardOf(admin, 'Grifo')).toContainText(offTheCells);
  const dropped = await cardOf(admin, 'Grifo').innerText();
  const place = /Coluna [\d,]+, linha [\d,]+/.exec(dropped)?.[0];
  if (!place) throw new Error(`the card has no position; received: ${dropped}`);
  await expect(cardOf(bia, 'Grifo')).toContainText(place);

  await admin.reload();
  await openCard(admin, 'Grifo');
  await expect(cardOf(admin, 'Grifo')).toContainText(place);

  await setFreeMovement(admin, false);
  await openCard(admin, 'Grifo');
  await expect(cardOf(admin, 'Grifo')).toContainText(place);

  await dragBetweenCells(bia, [12, 7], [4, 3]);
  await expect(cardOf(admin, 'Grifo')).toContainText('Coluna 5, linha 4 ·');
});
