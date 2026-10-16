import { expect, test, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';

// The default scene: 20 × 12 cells of 64 world px; "Enquadrar cena" centers it with a 32 px margin.
const SCENE = { widthCells: 20, heightCells: 12, cell: 64, margin: 32 };

function statusOf(page: Page): Locator {
  return page.getByRole('status', { name: 'Status do tabuleiro' });
}

function cardOf(page: Page, name: string): Locator {
  return page.getByRole('region', { name: `Cartão de ${name}` });
}

async function openCard(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name: 'Combate' }).click();
  const row = page
    .getByRole('list', { name: 'Na cena' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
  if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  await expect(cardOf(page, name)).toBeVisible();
}

async function createLyraFor(admin: Page, player: string): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await dialog.getByRole('checkbox', { name: player }).click();
  await dialog.getByRole('button', { name: 'Adicionar barra' }).click();
  await dialog.getByRole('button', { name: 'Adicionar barra' }).click();
  const second = dialog.getByRole('listitem', { name: /^Barra 2/ });
  await second.getByLabel('Rótulo').fill('Inspiração');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

// Screen point of the center of cell (col, row) after "Enquadrar cena".
async function cellCenterOf(
  page: Page,
  col: number,
  row: number,
): Promise<{ x: number; y: number }> {
  await page.getByRole('button', { name: 'Enquadrar cena (0)' }).click();
  const box = await boardOf(page).boundingBox();
  if (!box) throw new Error('the board has no box');
  const width = SCENE.widthCells * SCENE.cell;
  const height = SCENE.heightCells * SCENE.cell;
  const zoom = Math.min(
    4,
    Math.max(
      0.25,
      Math.min((box.width - 2 * SCENE.margin) / width, (box.height - 2 * SCENE.margin) / height),
    ),
  );
  const left = box.x + (box.width - width * zoom) / 2;
  const top = box.y + (box.height - height * zoom) / 2;
  return { x: left + (col + 0.5) * SCENE.cell * zoom, y: top + (row + 0.5) * SCENE.cell * zoom };
}

test('tokens live: the hidden bar never reaches another player, only the controller moves, and an F5 keeps it all', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const name = `Mesa tokens ${Date.now()}`;
  const admin = await (await browser.newContext()).newPage();
  const bia = await (await browser.newContext()).newPage();
  const caio = await (await browser.newContext()).newPage();
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

  await createLyraFor(admin, 'Bia');
  await openCard(bia, 'Lyra');
  await expect(cardOf(bia, 'Lyra')).toContainText('Coluna 11, linha 7');
  await expect(cardOf(bia, 'Lyra')).toContainText('PV');

  await boardOf(bia).focus();
  await bia.keyboard.press(']');
  await expect(statusOf(bia)).toContainText('Lyra selecionado, coluna 11, linha 7');
  await bia.keyboard.press('ArrowRight');
  await expect(statusOf(bia)).toContainText('Lyra foi para a coluna 12, linha 7');
  await openCard(admin, 'Lyra');
  await expect(cardOf(admin, 'Lyra')).toContainText('Coluna 12, linha 7');

  await openCard(caio, 'Lyra');
  await expect(cardOf(caio, 'Lyra')).toContainText('Inspiração');
  await expect(cardOf(caio, 'Lyra')).not.toContainText('PV');
  await boardOf(caio).focus();
  await caio.keyboard.press(']');
  await caio.keyboard.press('ArrowLeft');
  await expect(statusOf(caio)).toContainText('Esse token não é seu.');

  const pv = bia.getByLabel('PV de Lyra');
  await pv.fill('−50');
  await pv.press('Enter');
  await expect(cardOf(admin, 'Lyra')).toContainText('−40 / 10');

  const from = await cellCenterOf(admin, 11, 6);
  const to = await cellCenterOf(admin, 4, 4);
  await admin.mouse.move(from.x, from.y);
  await admin.mouse.down();
  await admin.mouse.move(to.x, to.y, { steps: 8 });
  await admin.mouse.up();
  await expect(cardOf(admin, 'Lyra')).toContainText('Coluna 5, linha 5');

  await bia.reload();
  await openCard(bia, 'Lyra');
  await expect(cardOf(bia, 'Lyra')).toContainText('Coluna 5, linha 5');
  await expect(cardOf(bia, 'Lyra')).toContainText('−40 / 10');
});
