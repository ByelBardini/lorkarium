import { expect, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';

function zoomLabelOf(page: Page) {
  return page.getByRole('toolbar', { name: 'Ferramentas do tabuleiro' }).getByText(/^\d+\s?%$/);
}

async function configureGrid(master: Page, width: string, height: string): Promise<void> {
  await master.getByRole('button', { name: 'Configurar cena' }).click();
  const dialog = master.getByRole('dialog', { name: 'Configurar cena' });
  await dialog.getByLabel('Largura (casas)').fill(width);
  await dialog.getByLabel('Altura (casas)').fill(height);
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

test('the room fills the screen, the grid changes live for everyone, the camera moves and an F5 keeps the grid', async ({
  newPlayerPage,
}) => {
  const name = `Mesa tabuleiro ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await enterFromTheList(admin, name);

  const adminBoard = boardOf(admin);
  await expect(adminBoard).toHaveAccessibleName('Tabuleiro: Cena 1, 20 × 12 casas');
  await expect(adminBoard.locator('canvas')).toBeVisible();
  const box = await adminBoard.boundingBox();
  expect(box?.width).toBeGreaterThan(400);
  await expect(admin.getByRole('button', { name: /^(Recolher|Expandir) menu$/ })).toHaveCount(0);

  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code);
  await expect(boardOf(bia)).toHaveAccessibleName(/20 × 12 casas/);

  await configureGrid(admin, '30', '20');
  await expect(boardOf(bia)).toHaveAccessibleName('Tabuleiro: Cena 1, 30 × 20 casas');

  // A new grid keeps the camera where it was: frame the bigger scene before reading its zoom.
  await admin.getByRole('button', { name: 'Enquadrar cena (0)' }).click();
  const before = await zoomLabelOf(admin).textContent();
  await adminBoard.hover();
  await admin.keyboard.down('Control');
  await admin.mouse.wheel(0, -300);
  await admin.keyboard.up('Control');
  await expect(zoomLabelOf(admin)).not.toHaveText(before ?? '');
  await admin.getByRole('button', { name: 'Enquadrar cena (0)' }).click();
  await expect(zoomLabelOf(admin)).toHaveText(before ?? '');

  await adminBoard.focus();
  await admin.keyboard.press('f');
  await expect(admin.getByRole('region', { name: 'Topo da sala' })).toBeHidden();
  await admin.keyboard.press('f');
  await expect(admin.getByRole('region', { name: 'Topo da sala' })).toBeVisible();

  await admin.reload();
  await expect(boardOf(admin)).toHaveAccessibleName('Tabuleiro: Cena 1, 30 × 20 casas');
});
