import { expect, type Page } from '@playwright/test';
import { altClickCell, cellCenterOf } from './support/board-cells';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';
import { statusOf } from './support/token-cards';

// The seeded admin's name comes from the env: any name but the "Alguém" of an unknown author.
const ADMIN_PINGED_6_3 = /^(?!Alguém ).+ marcou um ponto \(coluna 6, linha 3\)\.$/;

async function holdOnCell(page: Page, col: number, row: number, dragPx = 0): Promise<void> {
  const at = await cellCenterOf(page, col, row);
  await boardOf(page).focus();
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  if (dragPx > 0) await page.mouse.move(at.x + dragPx, at.y, { steps: 5 });
  await page.waitForTimeout(700);
  await page.mouse.up();
}

test('the ping of one reaches the other on the same grid, and nobody at another table', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const vharn = await createTableAndReadCode(admin, `Mesa ping ${stamp}`);
  const quelm = await createTableAndReadCode(admin, `Mesa ao lado ${stamp}`);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, vharn, admin);
  await signIn(caio, CAIO);
  await joinByCodeAndEnter(caio, quelm, admin);
  await enterFromTheList(admin, `Mesa ping ${stamp}`);
  await expect(boardOf(admin)).toBeVisible();

  // Alt + click with any tool: Bia hears it on her status line, by the cell it falls in.
  await altClickCell(admin, 5, 2);
  await expect(statusOf(bia)).toHaveText(ADMIN_PINGED_6_3);

  // Bia holds the button still in Selecionar: a ping, announced to the admin.
  await holdOnCell(bia, 8, 4);
  await expect(statusOf(admin)).toHaveText('Bia marcou um ponto (coluna 9, linha 5).');

  // Caio is at the other table: none of these pings reach him.
  // His status line stays empty (and an empty one is hidden), so look for the text anywhere.
  await expect(boardOf(caio)).toBeVisible();
  await expect(caio.getByText(/marcou um ponto/)).toHaveCount(0);

  // Held but dragged 20 px first, the press is a marquee: no ping goes out.
  await holdOnCell(bia, 3, 7, 20);
  await admin.waitForTimeout(1000);
  await expect(statusOf(admin)).not.toContainText('coluna 4, linha 8');
});
