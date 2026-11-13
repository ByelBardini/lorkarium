import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf, dragBetweenCells } from './support/board-cells';
import { meanChannelsAt } from './support/canvas-pixels';
import { cutOutBandPng } from './support/cut-out-png';
import { BIA } from './support/dev-players';
import { test, WIDE_ROOM } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
  showRoomTab,
} from './support/tables';
import { cardOf, chooseController, openCard, statusOf } from './support/token-cards';

// The scene, on the row of the eye: Lyra (10, 6), the statue (11, 6), the door x = 13.5, the ogre
// (14, 6). The statue's image is opaque only in its middle third, so its shadow opens a third of a
// cell per cell walked: it covers the ogre and every probe of the door, and leaves a corner of the
// goblin (14, 5) in the clear. The rectangle of the image would hide the goblin too.
const STATUE_PNG = {
  name: 'estatua-recortada.png',
  mimeType: 'image/png',
  buffer: cutOutBandPng({ side: 128, fromRow: 43, toRow: 85 }),
};
const STATUE_CELL = [11, 6] as const;
const STATUE_OUT_OF_THE_WAY_ROW = 9;
const DOOR_CELL = [13, 6] as const;
const OGRE_CELL = [14, 6] as const;

const DARK = 0.02;
const LIT = 0.05;
// The body of the statue is white: the floor around it never gets this bright.
const STATUE_WHITE = 0.3;

async function luminanceAt(page: Page, at: Readonly<{ x: number; y: number }>): Promise<number> {
  const { r, g, b } = await meanChannelsAt(page, at);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function luminanceOfCell(page: Page, [col, row]: readonly [number, number]): Promise<number> {
  return luminanceAt(page, await cellCenterOf(page, col, row));
}

function sceneRowOf(page: Page, name: string): Locator {
  return page
    .getByRole('list', { name: 'Na cena' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
}

async function expectOgreShown(bia: Page): Promise<void> {
  await expect(sceneRowOf(bia, 'Ogro')).toHaveCount(1);
  await expect.poll(() => luminanceOfCell(bia, OGRE_CELL)).toBeGreaterThan(LIT);
}

// By the list and by the pixel; the goblin stays: the cut is by the outline, not the rectangle.
async function expectOgreBehindTheStatue(bia: Page): Promise<void> {
  await expect(sceneRowOf(bia, 'Ogro')).toHaveCount(0);
  await expect(sceneRowOf(bia, 'Goblin')).toHaveCount(1);
  await expect.poll(() => luminanceOfCell(bia, OGRE_CELL)).toBeLessThan(DARK);
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

// Lyra for Bia at the center (10, 6), seeing fully for 6 cells: the whole stage is in her range.
async function createSeeingLyra(
  admin: Page,
  sight: Readonly<{ bright: string; dim: string }> = { bright: '9', dim: '12' },
): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await chooseController(dialog, 'Bia');
  await dialog.getByRole('tab', { name: 'Visão e luz' }).click();
  const vision = dialog.getByRole('group', { name: 'Enxerga no escuro' });
  await vision.getByLabel('Plena até (m)').fill(sight.bright);
  await vision.getByLabel('Penumbra até (m)').fill(sight.dim);
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

async function pressArrows(admin: Page, name: string, keys: readonly string[]): Promise<void> {
  await openCard(admin, name);
  const card = cardOf(admin, name);
  await boardOf(admin).focus();
  for (const key of keys) {
    const before = await card.textContent();
    await admin.keyboard.press(key);
    await expect(card).not.toHaveText(before ?? '');
  }
}

// A master's token is born on the center: the arrows take it to its place.
async function createTokenWalking(
  admin: Page,
  name: string,
  keys: readonly string[],
): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
  await pressArrows(admin, name, keys);
}

async function createStatue(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Estátua');
  await dialog.getByLabel('Arquivo de imagem').setInputFiles(STATUE_PNG);
  await expect(dialog.getByRole('img', { name: 'Imagem escolhida' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
  await pressArrows(admin, 'Estátua', ['ArrowRight']);
  await expect(cardOf(admin, 'Estátua')).toContainText('Coluna 12, linha 7');
}

async function blockerSwitchOf(
  admin: Page,
  name = 'Estátua',
): Promise<Readonly<{ on: Locator; dialog: Locator }>> {
  await openCard(admin, name);
  await cardOf(admin, name).getByRole('button', { name: 'Editar token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Editar token' });
  await dialog.getByRole('tab', { name: 'Visão e luz' }).click();
  return { on: dialog.getByRole('switch', { name: 'Bloqueia a visão' }), dialog };
}

async function turnOnTheBlock(admin: Page, name = 'Estátua'): Promise<void> {
  const { on, dialog } = await blockerSwitchOf(admin, name);
  await expect(on).toHaveAttribute('aria-checked', 'false');
  await on.click();
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

// Bia sees the four before the statue blocks: every assertion after this is the blocker's doing.
async function openTheStage(admin: Page, bia: Page, table: string): Promise<void> {
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, table);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, table);
  await setVisionDark(admin);
  await createSeeingLyra(admin);
  await createTokenWalking(admin, 'Ogro', Array<string>(4).fill('ArrowRight'));
  await createTokenWalking(admin, 'Goblin', [...Array<string>(4).fill('ArrowRight'), 'ArrowUp']);
  await createStatue(admin);
  await showRoomTab(bia, 'Combate');
  for (const name of ['Lyra', 'Ogro', 'Goblin', 'Estátua']) {
    await expect(sceneRowOf(bia, name)).toHaveCount(1);
  }
  await expectOgreShown(bia);
}

// A door on x = 13.5, two cells tall: its middle, where the icon sits, is the center of the cell.
async function drawDoor(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Paredes (P)' }).click();
  const panel = admin.getByRole('region', { name: 'Estilo da parede' });
  await panel.getByRole('radio', { name: 'Porta' }).click();
  await dragBetweenCells(admin, [13, 5], [13, 7]);
  await admin.getByRole('button', { name: 'Selecionar (V)' }).click();
}

async function expectDoorItem(admin: Page, item: 'Abrir' | 'Fechar'): Promise<void> {
  const [col, row] = DOOR_CELL;
  const door = await cellCenterOf(admin, col, row);
  await admin.mouse.click(door.x, door.y, { button: 'right' });
  await expect(admin.getByRole('menu').getByRole('menuitem', { name: item })).toBeVisible();
  await admin.keyboard.press('Escape');
}

test('sight blocker live: a cut-out image hides what is behind its outline, moving it brings the ogre back, and the door behind it opens only once in sight', async ({
  newPlayerPage,
}) => {
  test.setTimeout(300_000);
  const admin = await newPlayerPage(WIDE_ROOM);
  const bia = await newPlayerPage(WIDE_ROOM);
  await openTheStage(admin, bia, `Mesa da estátua ${Date.now()}`);

  // The master turns it on: the ogre leaves the list and the canvas of Bia, the master keeps it.
  await turnOnTheBlock(admin);
  await expectOgreBehindTheStatue(bia);
  await expect(sceneRowOf(admin, 'Ogro')).toHaveCount(1);

  // The statue hides nothing of itself: its body shows through the fog, white.
  await expect(sceneRowOf(bia, 'Estátua')).toHaveCount(1);
  await expect.poll(() => luminanceOfCell(bia, STATUE_CELL)).toBeGreaterThan(STATUE_WHITE);

  // Moved away, it hides nothing.
  await pressArrows(admin, 'Estátua', ['ArrowDown', 'ArrowDown', 'ArrowDown']);
  await expect(cardOf(admin, 'Estátua')).toContainText(`linha ${STATUE_OUT_OF_THE_WAY_ROW + 1}`);
  await expectOgreShown(bia);

  // With the statue back in front of a door, Bia has no door to click and the door stays shut.
  await drawDoor(admin);
  await pressArrows(admin, 'Estátua', ['ArrowUp', 'ArrowUp', 'ArrowUp']);
  await expect(cardOf(admin, 'Estátua')).toContainText('Coluna 12, linha 7');
  await expect.poll(() => luminanceOfCell(bia, STATUE_CELL)).toBeGreaterThan(STATUE_WHITE);
  const door = await cellCenterOf(bia, DOOR_CELL[0], DOOR_CELL[1]);
  await bia.mouse.click(door.x, door.y);
  await expect(statusOf(bia).filter({ hasText: 'Porta aberta.' })).toHaveCount(0);
  await expectDoorItem(admin, 'Abrir');

  // The statue moves away: the same click opens it, and the master sees it open.
  await pressArrows(admin, 'Estátua', ['ArrowDown', 'ArrowDown', 'ArrowDown']);
  await expect(cardOf(admin, 'Estátua')).toContainText(`linha ${STATUE_OUT_OF_THE_WAY_ROW + 1}`);
  await expect.poll(() => luminanceOfCell(bia, STATUE_CELL)).toBeLessThan(STATUE_WHITE);
  await bia.mouse.click(door.x, door.y);
  await expect(statusOf(bia)).toHaveText('Porta aberta.');
  await expectDoorItem(admin, 'Fechar');
});

test('sight blocker edges: a hidden statue blocks nothing, and the block outlives an F5 on both screens', async ({
  newPlayerPage,
}) => {
  test.setTimeout(300_000);
  const admin = await newPlayerPage(WIDE_ROOM);
  const bia = await newPlayerPage(WIDE_ROOM);
  await openTheStage(admin, bia, `Mesa da estátua oculta ${Date.now()}`);
  await turnOnTheBlock(admin);
  await expectOgreBehindTheStatue(bia);

  // Hidden, the statue leaves the screen of Bia and no longer gives its place away.
  const hiddenSwitch = cardOf(admin, 'Estátua').getByRole('button', {
    name: 'Invisível para os jogadores',
  });
  await hiddenSwitch.click();
  await expect(hiddenSwitch).toHaveAttribute('aria-pressed', 'true');
  await expect(sceneRowOf(bia, 'Estátua')).toHaveCount(0);
  await expectOgreShown(bia);

  // Shown again, it blocks again.
  await hiddenSwitch.click();
  await expect(hiddenSwitch).toHaveAttribute('aria-pressed', 'false');
  await expect(sceneRowOf(bia, 'Estátua')).toHaveCount(1);
  await expectOgreBehindTheStatue(bia);

  // After F5 the player is cut by the same outline, read again from the server.
  await bia.reload();
  await showRoomTab(bia, 'Combate');
  await expect(sceneRowOf(bia, 'Lyra')).toHaveCount(1);
  await expectOgreBehindTheStatue(bia);

  // And the switch of the master is still on.
  await admin.reload();
  const { on, dialog } = await blockerSwitchOf(admin);
  await expect(on).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});

test('sight blocker with no image: the disc it is drawn as casts the shadow, not the square of its footprint', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const admin = await newPlayerPage(WIDE_ROOM);
  const bia = await newPlayerPage(WIDE_ROOM);
  const table = `Mesa do pilar ${Date.now()}`;
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, table);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, table);
  await setVisionDark(admin);
  await createSeeingLyra(admin);
  await createTokenWalking(admin, 'Pilar', ['ArrowRight']);
  await turnOnTheBlock(admin, 'Pilar');

  // From Lyra (10.5, 6.5) the corner (11, 6) of the square would throw the shadow up to y = 3.5 at
  // x = 13.5; the disc of radius 0.42 at (11.5, 6.5) only to y = 5.1.
  await expect.poll(() => luminanceOfCell(bia, [14, 6])).toBeLessThan(DARK);
  await expect.poll(() => luminanceOfCell(bia, [13, 4])).toBeGreaterThan(DARK);
});

test('sight blocker with no image in the penumbra: its silhouette is the disc, leaving the corners of the cell to the floor', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const admin = await newPlayerPage(WIDE_ROOM);
  const bia = await newPlayerPage(WIDE_ROOM);
  const table = `Mesa do pilar na penumbra ${Date.now()}`;
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, table);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, table);
  await setVisionDark(admin);
  await createSeeingLyra(admin, { bright: '0', dim: '12' });
  await createTokenWalking(admin, 'Pilar', ['ArrowRight']);
  await turnOnTheBlock(admin, 'Pilar');

  // The disc is black at the center; the corner of the cell, 0.59 from the center, is past its 0.42.
  const center = await cellCenterOf(bia, 11, 6);
  const next = await cellCenterOf(bia, 12, 7);
  const corner = {
    x: center.x - (next.x - center.x) * 0.42,
    y: center.y - (next.y - center.y) * 0.42,
  };
  await expect.poll(() => luminanceAt(bia, center)).toBeLessThan(DARK);
  await expect.poll(() => luminanceAt(bia, corner)).toBeGreaterThan(DARK);
});
