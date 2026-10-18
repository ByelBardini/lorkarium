import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf, dragBetweenCells } from './support/board-cells';
import { BIA } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';
import { cardOf, openCard, statusOf } from './support/token-cards';

const WALL_BLOCKS = 'Uma parede bloqueia o caminho.';

function sceneTokensOf(page: Page): Locator {
  return page.getByRole('list', { name: 'Na cena' }).getByRole('listitem');
}

async function showSceneTokens(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Combate' }).click();
}

// Runs in the page (the e2e workspace has no DOM types): decodes the PNG and averages its pixels.
const MEAN_LUMINANCE_OF_PNG = `(async () => {
  const image = new Image();
  image.src = 'data:image/png;base64,BASE64';
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let total = 0;
  for (let index = 0; index < data.length; index += 4) {
    total += 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
  }
  return total / (data.length / 4) / 255;
})()`;

// The mean luminance (0–1) of an 8 × 8 px square of the screen: the canvas has no DOM, so a
// screenshot is decoded by the page itself (no PNG library in the e2e workspace).
async function luminanceAt(page: Page, at: Readonly<{ x: number; y: number }>): Promise<number> {
  const shot = await page.screenshot({ clip: { x: at.x - 4, y: at.y - 4, width: 8, height: 8 } });
  return page.evaluate<number>(MEAN_LUMINANCE_OF_PNG.replace('BASE64', shot.toString('base64')));
}

async function setVisionDark(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Configurar cena' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Configurar cena' });
  await dialog
    .getByRole('radiogroup', { name: 'Visão dos tokens' })
    .getByRole('radio', { name: 'Escuro' })
    .click();
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

// Lyra for Bia, seeing 3 m fully and 3 m more (2 + 2 cells of 1.5 m), at the center (10, 6).
async function createSeeingLyra(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await dialog.getByRole('checkbox', { name: 'Bia' }).click();
  await dialog.getByRole('checkbox', { name: 'Enxerga' }).click();
  await dialog.getByLabel('Visão plena (m)').fill('3');
  await dialog.getByLabel('Penumbra (m)').fill('3');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

// The ogre is born on the center too; the master moves it two cells right, to (12, 6).
async function createOgreBesideLyra(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Ogro');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
  await openCard(admin, 'Ogro');
  await boardOf(admin).focus();
  await admin.keyboard.press('ArrowRight');
  await expect(statusOf(admin)).toContainText('Ogro');
  await admin.keyboard.press('ArrowRight');
  await expect(cardOf(admin, 'Ogro')).toContainText('Coluna 13, linha 7');
}

// The line down x = 11.5, between Lyra (10, 6) and the ogre (12, 6); its middle is the center of
// the cell (11, 6), where a click erases the wall and the door icon sits.
async function drawWallBetween(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Paredes (P)' }).click();
  await expect(admin.getByRole('region', { name: 'Estilo da parede' })).toBeVisible();
  await dragBetweenCells(admin, [11, 3], [11, 9]);
}

// A wall keeps its kind: "Apagar parede" takes it out, and it is drawn again with the new kind.
// Both commands go on the one socket, so the erase reaches the server first.
async function changeWallKind(admin: Page, kind: string): Promise<void> {
  const panel = admin.getByRole('region', { name: 'Estilo da parede' });
  await panel.getByRole('radio', { name: 'Apagar parede' }).click();
  const middle = await cellCenterOf(admin, 11, 6);
  await admin.mouse.click(middle.x, middle.y);
  await panel.getByRole('radio', { name: 'Desenhar' }).click();
  await panel.getByRole('radio', { name: kind }).click();
  await dragBetweenCells(admin, [11, 3], [11, 9]);
}

async function doorMenuOf(admin: Page): Promise<Locator> {
  await admin.getByRole('button', { name: 'Selecionar (V)' }).click();
  const door = await cellCenterOf(admin, 11, 6);
  await admin.mouse.click(door.x, door.y, { button: 'right' });
  return admin.getByRole('menu');
}

test('vision, walls and doors live: the dark, a wall, a grate, a door opened, locked and previewed, kept on F5', async ({
  newPlayerPage,
}) => {
  test.setTimeout(240_000);
  const name = `Mesa escura ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code);
  await enterFromTheList(admin, name);

  await setVisionDark(admin);
  await createSeeingLyra(admin);
  await createOgreBesideLyra(admin);
  await showSceneTokens(bia);
  await expect(sceneTokensOf(bia)).toHaveCount(2);

  // The wall: the ogre leaves the list of Bia, and her canvas is dark on its cell, lit beside Lyra.
  await drawWallBetween(admin);
  await expect(sceneTokensOf(bia)).toHaveCount(1);
  await expect(sceneTokensOf(bia)).toContainText('Lyra');
  expect(await luminanceAt(bia, await cellCenterOf(bia, 12, 6))).toBeLessThan(0.02);
  expect(await luminanceAt(bia, await cellCenterOf(bia, 9, 6))).toBeGreaterThan(0.05);

  // Bia drags Lyra through the wall: it stops her, and her card still says (10, 6).
  await dragBetweenCells(bia, [10, 6], [13, 6]);
  await expect(statusOf(bia)).toHaveText(WALL_BLOCKS);
  await openCard(bia, 'Lyra');
  await expect(cardOf(bia, 'Lyra')).toContainText('Coluna 11, linha 7');

  // A grate lets the sight through but not Lyra.
  await changeWallKind(admin, 'Grade');
  await showSceneTokens(bia);
  await expect(sceneTokensOf(bia)).toHaveCount(2);
  await dragBetweenCells(bia, [10, 6], [13, 6]);
  await expect(statusOf(bia)).toHaveText(WALL_BLOCKS);

  // A door: Bia opens it by its icon, the master sees it open, and Lyra walks through and back.
  await changeWallKind(admin, 'Porta');
  await expect(sceneTokensOf(bia)).toHaveCount(1);
  const door = await cellCenterOf(bia, 11, 6);
  await bia.mouse.click(door.x, door.y);
  await expect(statusOf(bia)).toHaveText('Porta aberta.');
  const opened = await doorMenuOf(admin);
  await expect(opened.getByRole('menuitem', { name: 'Fechar' })).toBeVisible();
  await admin.keyboard.press('Escape');
  await dragBetweenCells(bia, [10, 6], [13, 6]);
  await openCard(bia, 'Lyra');
  await expect(cardOf(bia, 'Lyra')).toContainText('Coluna 14, linha 7');
  await dragBetweenCells(bia, [13, 6], [10, 6]);
  await expect(cardOf(bia, 'Lyra')).toContainText('Coluna 11, linha 7');

  // The master locks it: the click of Bia hears it is locked.
  const menu = await doorMenuOf(admin);
  await menu.getByRole('menuitem', { name: 'Trancar' }).click();
  await expect(sceneTokensOf(bia)).toHaveCount(1);
  await bia.mouse.click(door.x, door.y);
  await expect(statusOf(bia)).toHaveText('A porta está trancada.');

  // "Ver como os selecionados" with Lyra: the ogre behind the locked door leaves the master's list.
  await showSceneTokens(admin);
  await expect(sceneTokensOf(admin)).toHaveCount(2);
  await openCard(admin, 'Lyra');
  await admin.getByRole('button', { name: 'Ver como os selecionados' }).click();
  await expect(sceneTokensOf(admin)).toHaveCount(1);

  // After F5 the scene is still dark, the door still locked and the ogre still hidden from Bia.
  await bia.reload();
  await showSceneTokens(bia);
  await expect(sceneTokensOf(bia)).toHaveCount(1);
  await expect(sceneTokensOf(bia)).toContainText('Lyra');
  await bia.mouse.click(door.x, door.y);
  await expect(statusOf(bia)).toHaveText('A porta está trancada.');
});
