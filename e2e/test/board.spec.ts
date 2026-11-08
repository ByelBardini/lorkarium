import { expect, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';
import { cellCenterOf } from './support/board-cells';
import { sceneTokensOf, statusOf } from './support/token-cards';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';

function zoomLabelOf(page: Page) {
  return page.getByRole('toolbar', { name: 'Ferramentas do tabuleiro' }).getByText(/^\d+\s?%$/);
}

// Runs in the page (the e2e workspace has no DOM types): the GPU dropping the context, on demand,
// by the extension the browser offers to test it. The context is the one PixiJS already made
// (`getContext` hands the same one back).
const LOSE_BOARD_CONTEXT = `(() => {
  const canvas = document.querySelector('[aria-roledescription="tabuleiro"] canvas');
  const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
  const extension = gl?.getExtension('WEBGL_lose_context');
  if (!extension) throw new Error('no WEBGL_lose_context on the board canvas (context: ' + gl + ')');
  extension.loseContext();
})()`;

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
  await joinByCodeAndEnter(bia, code, admin);
  await expect(boardOf(bia)).toHaveAccessibleName(/20 × 12 casas/);

  await configureGrid(admin, '30', '20');
  await expect(boardOf(bia)).toHaveAccessibleName('Tabuleiro: Cena 1, 30 × 20 casas');

  // A new grid keeps the camera where it was: frame the bigger scene before reading its zoom.
  // The label follows the camera one frame later (`reportCamera` on the ticker): wait for it to
  // leave the old fit, or the read catches the zoom of the 20 × 12 grid.
  const oldFit = await zoomLabelOf(admin).textContent();
  await admin.getByRole('button', { name: 'Enquadrar cena (0)' }).click();
  await expect(zoomLabelOf(admin)).not.toHaveText(oldFit ?? '');
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

test('the board comes back after losing its WebGL context, at the same zoom', async ({
  newPlayerPage,
}) => {
  const name = `Mesa contexto ${Date.now()}`;
  const admin = await newPlayerPage();
  await signIn(admin, adminCredentials());
  await createTableAndReadCode(admin, name);
  await enterFromTheList(admin, name);
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Goblin');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();

  // Away from the fit: a board that came back framing the scene would show another zoom.
  const fit = await zoomLabelOf(admin).textContent();
  await boardOf(admin).focus();
  await admin.keyboard.press('+');
  await expect(zoomLabelOf(admin)).not.toHaveText(fit ?? '');
  const before = await zoomLabelOf(admin).textContent();
  await admin.evaluate(LOSE_BOARD_CONTEXT);
  await expect(statusOf(admin)).toHaveText('O tabuleiro foi recarregado.');
  await expect(boardOf(admin).locator('canvas')).toBeVisible();
  await expect(zoomLabelOf(admin)).toHaveText(before ?? '');

  // The token born at the center cell (10, 6) still answers a click.
  const goblin = await cellCenterOf(admin, 10, 6);
  await admin.mouse.click(goblin.x, goblin.y);
  await admin.getByRole('tab', { name: 'Combate' }).click();
  await expect(sceneTokensOf(admin).filter({ hasText: 'Goblin' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
