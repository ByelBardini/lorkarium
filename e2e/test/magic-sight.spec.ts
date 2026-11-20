import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf, dragBetweenCells } from './support/board-cells';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
  showRoomTab,
} from './support/tables';
import { chooseController, statusOf } from './support/token-cards';

function sceneRowOf(page: Page, name: string): Locator {
  return page
    .getByRole('list', { name: 'Na cena' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
}

async function expectInScene(page: Page, name: string, count: 0 | 1): Promise<void> {
  await showRoomTab(page, 'Combate');
  await expect(sceneRowOf(page, name)).toHaveCount(count);
}

// "Novo token" at the center (10, 6); `player` in control, or nobody (the master's alone).
async function createToken(
  admin: Page,
  name: string,
  player: string | null,
  magicSightMeters?: string,
): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  if (player) await chooseController(dialog, player);
  if (magicSightMeters) {
    await dialog.getByRole('tab', { name: 'Visão e luz' }).click();
    const magic = dialog.getByRole('group', { name: 'Visão mágica' });
    await magic.getByRole('switch', { name: 'Visão mágica' }).click();
    await magic.getByLabel('Até (m)', { exact: true }).fill(magicSightMeters);
  }
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

test('magic sight: the master hides the wolf and turns on the magic sight of Bia’s mage; Bia sees the wolf near and stops seeing it far; Caio never sees it', async ({
  newPlayerPage,
}) => {
  // Three pages drawing PixiJS without a GPU, like token-hidden.spec.
  test.setTimeout(240_000);
  const name = `Mesa visão mágica ${Date.now()}`;
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
    await joinByCodeAndEnter(page, code, admin);
  }
  await enterFromTheList(admin, name);

  // The wolf is nobody's, moved to (12, 6); the mage of Bia (4 cells of magic sight, 6 m) stays
  // at the center (10, 6): the wolf is 1.5 cells from its eye.
  await createToken(admin, 'Lobo', null);
  await dragBetweenCells(admin, [10, 6], [12, 6]);
  await createToken(admin, 'Mago', 'Bia', '6');
  await expectInScene(caio, 'Lobo', 1);

  const wolf = await cellCenterOf(admin, 12, 6);
  await admin.mouse.click(wolf.x, wolf.y, { button: 'right' });
  const menu = admin.getByRole('menu', { name: 'Ações de Lobo' });
  await menu.getByRole('menuitem', { name: 'Tornar invisível' }).click();
  await expect(menu).toBeHidden();

  // Bia sees it through the mage; Caio, who sees nothing invisible, loses it.
  await expectInScene(bia, 'Lobo', 1);
  await expectInScene(caio, 'Lobo', 0);

  // Out of the magic sight (5.5 cells from the eye), Bia stops seeing it; near again, it is back.
  await dragBetweenCells(admin, [12, 6], [4, 6]);
  await expect(statusOf(admin)).toContainText('Lobo foi para a coluna 5, linha 7');
  await expectInScene(bia, 'Lobo', 0);
  await dragBetweenCells(admin, [4, 6], [12, 6]);
  await expect(statusOf(admin)).toContainText('Lobo foi para a coluna 13, linha 7');
  await expectInScene(bia, 'Lobo', 1);

  await caio.reload();
  await expectInScene(caio, 'Mago', 1);
  await expectInScene(caio, 'Lobo', 0);
});
