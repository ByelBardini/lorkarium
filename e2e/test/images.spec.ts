import { fileURLToPath } from 'node:url';
import { expect, type Page, type Response } from '@playwright/test';
import { cellCenterOf, type SceneCells } from './support/board-cells';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { cardOf, openCard, statusOf, chooseController } from './support/token-cards';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';

const MAP = fileURLToPath(new URL('./fixtures/mapa-1400x700.png', import.meta.url));
const PORTRAIT = fileURLToPath(new URL('./fixtures/token.png', import.meta.url));

function sceneDialogOf(page: Page) {
  return page.getByRole('dialog', { name: 'Configurar cena' });
}

async function openSceneDialog(master: Page) {
  await master.getByRole('button', { name: 'Configurar cena' }).click();
  return sceneDialogOf(master);
}

async function createLyraWithImage(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await chooseController(dialog, 'Bia');
  await dialog.getByLabel('Arquivo de imagem').setInputFiles(PORTRAIT);
  await expect(dialog.getByRole('img', { name: 'Imagem escolhida' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

// The cell of Lyra, read from her card ("Coluna 11, linha 6" → (10, 5)).
async function lyraCellOf(page: Page): Promise<readonly [number, number]> {
  await openCard(page, 'Lyra');
  const text = (await cardOf(page, 'Lyra').textContent()) ?? '';
  const match = /Coluna (\d+), linha (\d+)/.exec(text);
  if (!match) throw new Error(`the card of Lyra shows no cell: ${text}`);
  return [Number(match[1]) - 1, Number(match[2]) - 1];
}

async function rightClickLyra(page: Page, scene: SceneCells): Promise<void> {
  const [col, row] = await lyraCellOf(page);
  const at = await cellCenterOf(page, col, row, scene);
  await page.mouse.click(at.x, at.y, { button: 'right' });
}

function assetAnswersOf(page: Page): Response[] {
  const answers: Response[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/api/assets/')) answers.push(response);
  });
  return answers;
}

test('background, token image and facing reach three browsers, survive an F5 and refuse what they must', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const name = `Mesa imagens ${Date.now()}`;
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

  const mapDialog = await openSceneDialog(admin);
  await mapDialog.getByLabel('Arquivo de imagem').setInputFiles(MAP);
  await expect(mapDialog.getByLabel('Altura (casas)')).toHaveValue('10');
  await mapDialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(mapDialog).toBeHidden();
  await expect(boardOf(bia)).toHaveAccessibleName('Tabuleiro: Cena 1, 20 × 10 casas');

  await createLyraWithImage(admin);
  await boardOf(bia).focus();
  await bia.keyboard.press(']');
  await bia.keyboard.press('e');
  await expect(statusOf(bia)).toContainText('Lyra olha para o sudeste.');
  await openCard(admin, 'Lyra');
  await expect(cardOf(admin, 'Lyra')).toContainText('Olha para o sudeste');

  const scene = { widthCells: 20, heightCells: 10 };
  await rightClickLyra(bia, scene);
  const biaMenu = bia.getByRole('menu', { name: 'Ações de Lyra' });
  await biaMenu.getByRole('menuitemcheckbox', { name: 'Borda redonda' }).click();
  await expect(biaMenu).toBeHidden();
  await rightClickLyra(caio, scene);
  await caio.waitForTimeout(500);
  await expect(caio.getByRole('menu', { name: 'Ações de Lyra' })).toHaveCount(0);

  await boardOf(caio).focus();
  await caio.keyboard.press(']');
  await caio.keyboard.press('e');
  await expect(statusOf(caio)).toContainText('Esse token não é seu.');

  const stretch = await openSceneDialog(admin);
  await stretch.getByRole('checkbox', { name: 'Manter proporção da imagem' }).click();
  await stretch.getByLabel('Largura (casas)').fill('30');
  await expect(stretch.getByLabel('Altura (casas)')).toHaveValue('10');
  await stretch.getByRole('button', { name: 'Salvar' }).click();
  await expect(stretch).toBeHidden();
  await expect(boardOf(bia)).toHaveAccessibleName('Tabuleiro: Cena 1, 30 × 10 casas');

  const biaAssets = assetAnswersOf(bia);
  await bia.reload();
  await expect(boardOf(bia)).toHaveAccessibleName('Tabuleiro: Cena 1, 30 × 10 casas');
  await openCard(bia, 'Lyra');
  await expect(cardOf(bia, 'Lyra')).toContainText('Olha para o sudeste');
  await expect.poll(() => biaAssets.length).toBeGreaterThanOrEqual(2);
  expect(biaAssets.map((answer) => answer.status()).every((status) => status === 200)).toBe(true);
  await rightClickLyra(bia, { widthCells: 30, heightCells: 10 });
  await expect(
    bia.getByRole('menu', { name: 'Ações de Lyra' }).getByRole('menuitemcheckbox', {
      name: 'Borda redonda',
    }),
  ).toHaveAttribute('aria-checked', 'true');
  await bia.keyboard.press('Escape');

  const linkDialog = await openSceneDialog(admin);
  await linkDialog.getByRole('button', { name: 'Usar link de imagem' }).click();
  await linkDialog.getByLabel('Link da imagem').fill('http://127.0.0.1/x.png');
  await linkDialog.getByRole('button', { name: 'Usar link' }).click();
  await expect(linkDialog.getByRole('alert')).toContainText('Esse link não pode ser usado.');
});
