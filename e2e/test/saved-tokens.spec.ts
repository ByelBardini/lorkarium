import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { cellCenterOf } from './support/board-cells';
import { meanChannelsAt } from './support/canvas-pixels';
import { BIA } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
  showRoomTab,
} from './support/tables';

// A tan 256 × 256 portrait: on the dark board, the cell under it leans to red over blue.
const PORTRAIT = fileURLToPath(new URL('./fixtures/token.png', import.meta.url));
const STILL = { reducedMotion: 'reduce' } as const;
// The portrait reads ~0.3 red over blue; the empty board ~0.
const ZOMBIE_WARMTH = 0.15;
// Left of the board: the side panel covers the right columns.
const FIRST: readonly [number, number] = [3, 3];
const SECOND: readonly [number, number] = [5, 3];

async function zombieIsAt(page: Page, cell: readonly [number, number]): Promise<boolean> {
  const { r, b } = await meanChannelsAt(page, await cellCenterOf(page, ...cell), 6);
  return r - b > ZOMBIE_WARMTH;
}

async function createZombie(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Zumbi');
  await dialog.getByLabel('Arquivo de imagem').setInputFiles(PORTRAIT);
  await expect(dialog.getByRole('img', { name: 'Imagem escolhida' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

// A new token lands at the middle of the default scene.
async function saveZombieFromTheBoard(admin: Page): Promise<void> {
  const { x, y } = await cellCenterOf(admin, 10, 6);
  await admin.mouse.click(x, y, { button: 'right' });
  const menu = admin.getByRole('menu', { name: 'Ações de Zumbi' });
  await menu.getByRole('menuitem', { name: 'Salvar na minha lista…' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Salvar na minha lista' });
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

async function clickCell(page: Page, cell: readonly [number, number]): Promise<void> {
  const { x, y } = await cellCenterOf(page, ...cell);
  await page.mouse.click(x, y);
}

test('the master saves the Zumbi, arms it in "Tokens salvos" and puts two on the map; the player sees both, Ctrl+Z takes the last back', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const name = `Mesa invocações ${Date.now()}`;
  const admin = await newPlayerPage(STILL);
  const bia = await newPlayerPage(STILL);
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, name);
  await createZombie(admin);
  await saveZombieFromTheBoard(admin);

  await showRoomTab(admin, 'Tokens salvos');
  await admin.getByRole('button', { name: 'Pôr Zumbi no mapa' }).click();
  await expect(admin.getByText('Clique no mapa para pôr Zumbi · Esc para parar')).toBeVisible();
  await clickCell(admin, FIRST);
  await clickCell(admin, SECOND);

  await expect.poll(() => zombieIsAt(bia, FIRST)).toBe(true);
  await expect.poll(() => zombieIsAt(bia, SECOND)).toBe(true);

  await admin.keyboard.press('Escape');
  await expect(admin.getByText('Clique no mapa para pôr Zumbi · Esc para parar')).toBeHidden();
  await admin.getByRole('application', { name: /Tabuleiro/ }).focus();
  await admin.keyboard.press('Control+z');
  await expect.poll(() => zombieIsAt(bia, SECOND)).toBe(false);
  expect(await zombieIsAt(bia, FIRST)).toBe(true);
});
