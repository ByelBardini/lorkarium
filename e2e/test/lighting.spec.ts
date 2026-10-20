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
import { cardOf, openCard, statusOf, chooseController } from './support/token-cards';

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

// The mean luminance (0–1) of an 8 × 8 px square of the screen, decoded by the page itself.
async function luminanceAt(page: Page, at: Readonly<{ x: number; y: number }>): Promise<number> {
  const shot = await page.screenshot({ clip: { x: at.x - 4, y: at.y - 4, width: 8, height: 8 } });
  return page.evaluate<number>(MEAN_LUMINANCE_OF_PNG.replace('BASE64', shot.toString('base64')));
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

// Lyra for Bia, with no darkvision: she sees only what is lit. Born on the center, (10, 6).
async function createBlindLyra(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await chooseController(dialog, 'Bia');
  // A new token sees in the dark by default: the premise here is that she sees only what is lit.
  await dialog.getByRole('tab', { name: 'Visão e luz' }).click();
  await dialog.getByRole('switch', { name: 'Enxerga no escuro' }).click();
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

// The ogre is born on the center too; the master moves it four cells right, to (14, 6) (past the
// fourteenth column the panel of the room covers the board).
async function createFarOgre(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Ogro');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
  await openCard(admin, 'Ogro');
  await boardOf(admin).focus();
  for (let step = 0; step < 4; step += 1) {
    await admin.keyboard.press('ArrowRight');
    await expect(cardOf(admin, 'Ogro')).toContainText(`Coluna ${12 + step}, linha 7`);
  }
}

// "Editar token" on Lyra: a torch until 6 m and dim until 12 m (4 + 4 cells of 1.5 m).
async function giveLyraATorch(admin: Page): Promise<void> {
  await openCard(admin, 'Lyra');
  await cardOf(admin, 'Lyra').getByRole('button', { name: 'Editar token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Editar token' });
  await dialog.getByRole('tab', { name: 'Visão e luz' }).click();
  await dialog.getByRole('switch', { name: 'Emite luz' }).click();
  const light = dialog.getByRole('group', { name: 'Emite luz' });
  await light.getByLabel('Plena até (m)').fill('6');
  await light.getByLabel('Penumbra até (m)').fill('12');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
}

test('lighting live: a torch on the map shows the ogre, put out it hides it, and the torch of Lyra lights her way and the ogre, kept on F5', async ({
  newPlayerPage,
}) => {
  test.setTimeout(240_000);
  const name = `Mesa iluminada ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code);
  await enterFromTheList(admin, name);

  await setVisionDark(admin);
  await createBlindLyra(admin);
  await createFarOgre(admin);
  await bia.getByRole('tab', { name: 'Combate' }).click();
  await expect(sceneTokensOf(bia)).toHaveCount(1);

  // The master puts a torch on the ogre: Bia, with no darkvision, now sees him by its light.
  await admin.keyboard.press('l');
  await expect(admin.getByRole('region', { name: 'Luz' })).toBeVisible();
  const ogre = await cellCenterOf(admin, 14, 6);
  await admin.mouse.click(ogre.x, ogre.y);
  await expect(sceneTokensOf(bia)).toHaveCount(2);
  await expect(sceneTokensOf(bia)).toContainText(['Lyra', 'Ogro']);

  // The master puts it out from the menu of its icon: the ogre is gone for Bia.
  await admin.mouse.click(ogre.x, ogre.y, { button: 'right' });
  const menu = admin.getByRole('menu', { name: 'Ações da luz' });
  await menu.getByRole('menuitem', { name: 'Apagar' }).click();
  await expect(statusOf(admin)).toHaveText('Luz apagada.');
  await expect(sceneTokensOf(bia)).toHaveCount(1);

  // The torch of Lyra lights the floor around her on the canvas of Bia.
  const besideLyra = await cellCenterOf(bia, 12, 6);
  expect(await luminanceAt(bia, besideLyra)).toBeLessThan(0.02);
  await admin.keyboard.press('v');
  await giveLyraATorch(admin);
  await expect.poll(() => luminanceAt(bia, besideLyra)).toBeGreaterThan(0.05);
  await expect(sceneTokensOf(bia)).toHaveCount(2);

  // Bia puts out her own torch from the menu of Lyra: the dark comes back.
  const lyra = await cellCenterOf(bia, 10, 6);
  await bia.mouse.click(lyra.x, lyra.y, { button: 'right' });
  const lyraMenu = bia.getByRole('menu', { name: 'Ações de Lyra' });
  await lyraMenu.getByRole('menuitemcheckbox', { name: 'Luz acesa' }).click();
  await expect.poll(() => luminanceAt(bia, besideLyra)).toBeLessThan(0.02);
  await expect(sceneTokensOf(bia)).toHaveCount(1);

  // After F5 the torch of the map and the torch of Lyra are still out.
  await bia.reload();
  await bia.getByRole('tab', { name: 'Combate' }).click();
  await expect(sceneTokensOf(bia)).toHaveCount(1);
  await expect
    .poll(async () => luminanceAt(bia, await cellCenterOf(bia, 12, 6)))
    .toBeLessThan(0.02);
});
