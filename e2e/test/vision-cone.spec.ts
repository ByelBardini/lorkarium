import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf } from './support/board-cells';
import { BIA } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';
import { cardOf, chooseController, openCard, statusOf } from './support/token-cards';

// Runs in the page (the e2e workspace has no DOM types): decodes the PNG and averages each channel.
const MEAN_CHANNELS_OF_PNG = `(async () => {
  const image = new Image();
  image.src = 'data:image/png;base64,BASE64';
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const total = [0, 0, 0];
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) total[channel] += data[index + channel];
  }
  const pixels = data.length / 4;
  return { r: total[0] / pixels / 255, g: total[1] / pixels / 255, b: total[2] / pixels / 255 };
})()`;

type Channels = Readonly<{ r: number; g: number; b: number }>;
type Cell = readonly [number, number];

// The mean of each channel (0–1) of an 8 × 8 px square of the screen at the center of a cell.
async function channelsAt(page: Page, [col, row]: Cell): Promise<Channels> {
  const at = await cellCenterOf(page, col, row);
  const shot = await page.screenshot({ clip: { x: at.x - 4, y: at.y - 4, width: 8, height: 8 } });
  return page.evaluate<Channels>(MEAN_CHANNELS_OF_PNG.replace('BASE64', shot.toString('base64')));
}

async function luminanceAt(page: Page, cell: Cell): Promise<number> {
  const { r, g, b } = await channelsAt(page, cell);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// How much the gold outline of the master (or a warm light) pushes red over blue.
async function redOverBlueAt(page: Page, cell: Cell): Promise<number> {
  const { r, b } = await channelsAt(page, cell);
  return r - b;
}

function sceneTokensOf(page: Page): Locator {
  return page.getByRole('list', { name: 'Na cena' }).getByRole('listitem');
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

type LyraLook = Readonly<{ darkvision: boolean; fieldOfView?: string; lantern?: string }>;

// Lyra for Bia, born on the center, (10, 6), looking right; by default she sees in the dark until
// 9 m (6 cells).
async function createLyra(admin: Page, look: LyraLook): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await chooseController(dialog, 'Bia');
  await dialog.getByRole('tab', { name: 'Visão e luz' }).click();
  if (!look.darkvision) await dialog.getByRole('switch', { name: 'Enxerga no escuro' }).click();
  if (look.fieldOfView) await dialog.getByLabel('Campo de visão (°)').fill(look.fieldOfView);
  if (look.lantern) {
    await dialog.getByRole('switch', { name: 'Emite luz' }).click();
    const light = dialog.getByRole('group', { name: 'Emite luz' });
    await light.getByLabel('Plena até (m)').fill('9');
    await light.getByLabel('Penumbra até (m)').fill('');
    await light.getByLabel('Abertura do feixe (°)').fill(look.lantern);
  }
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

// A token of the master, born on the center and moved `steps` cells (negative = left).
async function createMastersToken(admin: Page, name: string, steps: number): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
  await openCard(admin, name);
  await boardOf(admin).focus();
  const key = steps < 0 ? 'ArrowLeft' : 'ArrowRight';
  for (let step = 1; step <= Math.abs(steps); step += 1) {
    await admin.keyboard.press(key);
    const col = 10 + Math.sign(steps) * step;
    await expect(cardOf(admin, name)).toContainText(`Coluna ${col + 1}, linha 7`);
  }
}

async function tableOfAnaAndBia(newPlayerPage: () => Promise<Page>, name: string) {
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code);
  await enterFromTheList(admin, name);
  await setVisionDark(admin);
  return { admin, bia };
}

test('field of view: Bia sees ahead and not behind, feels the goblin at her back, turns to see the ogre behind; Ana sees the outline', async ({
  newPlayerPage,
}) => {
  test.setTimeout(300_000);
  const { admin, bia } = await tableOfAnaAndBia(newPlayerPage, `Mesa do cone ${Date.now()}`);
  await createLyra(admin, { darkvision: true, fieldOfView: '90' });
  await createMastersToken(admin, 'Ogro', 4);
  await createMastersToken(admin, 'Troll', -4);
  await createMastersToken(admin, 'Goblin', -1);

  // Lyra looks right: the ogre ahead at (14, 6) is seen, the troll behind at (6, 6) is not, and
  // the goblin right at her back, at (9, 6), is felt by the ring.
  await bia.getByRole('tab', { name: 'Combate' }).click();
  await expect(sceneTokensOf(bia)).toHaveCount(3);
  await expect(sceneTokensOf(bia)).toContainText(['Goblin', 'Lyra', 'Ogro']);
  await expect.poll(() => luminanceAt(bia, [12, 6])).toBeGreaterThan(0.05);
  expect(await luminanceAt(bia, [7, 6])).toBeLessThan(0.02);

  // Bia turns Lyra around with E: now the troll shows and the floor behind her opens.
  await openCard(bia, 'Lyra');
  await boardOf(bia).focus();
  for (const wind of ['sudeste', 'sul', 'sudoeste', 'oeste']) {
    await bia.keyboard.press('e');
    await expect(statusOf(bia)).toContainText(`Lyra olha para o ${wind}.`);
  }
  await expect(sceneTokensOf(bia)).toContainText(['Goblin', 'Lyra', 'Troll']);
  await expect.poll(() => luminanceAt(bia, [7, 6])).toBeGreaterThan(0.05);
  expect(await luminanceAt(bia, [13, 6])).toBeLessThan(0.02);

  // Ana selects Lyra: the gold outline of her field (now looking left) tints the floor at (7, 6),
  // not at (13, 6) behind her.
  const left = await redOverBlueAt(admin, [7, 6]);
  const right = await redOverBlueAt(admin, [13, 6]);
  await openCard(admin, 'Lyra');
  await expect.poll(async () => (await redOverBlueAt(admin, [7, 6])) - left).toBeGreaterThan(0.005);
  expect(Math.abs((await redOverBlueAt(admin, [13, 6])) - right)).toBeLessThan(0.003);
});

test('lantern: the beam of 60° of a blind Lyra lights ahead and not behind, on the canvas of Bia', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { admin, bia } = await tableOfAnaAndBia(newPlayerPage, `Mesa da lanterna ${Date.now()}`);

  await createLyra(admin, { darkvision: false, lantern: '60' });

  await expect.poll(() => luminanceAt(bia, [13, 6])).toBeGreaterThan(0.05);
  expect(await luminanceAt(bia, [8, 6])).toBeLessThan(0.02);
});

test('spotlight: Ana puts a spotlight of 60°, aims it by its handle, and the canvas of Bia lights only in the cone, kept on F5', async ({
  newPlayerPage,
}) => {
  test.setTimeout(240_000);
  const { admin, bia } = await tableOfAnaAndBia(newPlayerPage, `Mesa do holofote ${Date.now()}`);
  await createLyra(admin, { darkvision: false });

  // The next light opens 60° and is born looking right, at (7, 6), left of Lyra (past the
  // fourteenth column the panel of the room covers the board).
  await admin.keyboard.press('l');
  const panel = admin.getByRole('region', { name: 'Luz' });
  await panel.getByLabel('Abertura (°)').fill('60');
  const spot = await cellCenterOf(admin, 7, 6);
  await admin.mouse.click(spot.x, spot.y);
  await expect.poll(() => luminanceAt(bia, [9, 6])).toBeGreaterThan(0.05);
  expect(await luminanceAt(bia, [5, 6])).toBeLessThan(0.02);

  // Ana picks it and drags its handle (36 world px right of the icon) to the left of it.
  await admin.mouse.click(spot.x, spot.y);
  const next = await cellCenterOf(admin, 8, 6);
  const zoom = (next.x - spot.x) / 64;
  await admin.mouse.move(spot.x + 36 * zoom, spot.y);
  await admin.mouse.down();
  await admin.mouse.move(spot.x - 100, spot.y, { steps: 8 });
  await admin.mouse.up();

  await expect.poll(() => luminanceAt(bia, [5, 6])).toBeGreaterThan(0.05);
  await expect.poll(() => luminanceAt(bia, [9, 6])).toBeLessThan(0.02);

  await bia.reload();
  await expect.poll(() => luminanceAt(bia, [5, 6])).toBeGreaterThan(0.05);
  expect(await luminanceAt(bia, [9, 6])).toBeLessThan(0.02);
});
