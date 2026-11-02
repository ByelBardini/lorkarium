import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA } from './support/dev-players';
import { cellCenterOf } from './support/board-cells';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import {
  createCharacterTokenWithPv,
  createTokenFor,
  linkCenterTokenToCharacter,
  openCard,
} from './support/token-cards';

// The foot of the "Combate" tab with nothing selected: the token of my character in this grid.
function characterTokenDockOf(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name: 'Token principal' })
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

// The same foot when my character has no token in this grid: the character itself.
function characterDockOf(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name: 'Meu personagem' })
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
}

async function unlinkCenterToken(master: Page, token: string): Promise<void> {
  const center = await cellCenterOf(master, 10, 6);
  await master.mouse.click(center.x, center.y, { button: 'right' });
  const menu = master.getByRole('menu', { name: `Ações de ${token}` });
  await menu.getByRole('menuitem', { name: 'Desligar do personagem' }).click();
  await expect(menu).toBeHidden();
}

// Bia takes 2 PV off her character through the balloon of the foot.
async function hurtFromTheDock(dock: Locator): Promise<void> {
  await dock.getByRole('button', { name: 'Editar PV de Lyra' }).dblclick();
  const current = dock
    .page()
    .getByRole('dialog', { name: 'PV' })
    .getByRole('textbox', { name: 'Atual' });
  await current.fill('−2');
  await current.press('Enter');
  await expect(dock).toContainText('8 / 10');
}

test("the dock shows the token of Bia's character in the grid, without it the character itself, and a reload keeps it", async ({
  newPlayerPage,
}) => {
  test.setTimeout(150_000);
  const name = `Mesa meu personagem ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, name);
  await createCharacterTokenWithPv(admin, 'Lyra', 'Bia');

  // With nothing selected, the foot of the "Combate" tab already shows her Lyra.
  await bia.getByRole('tab', { name: 'Combate' }).click();
  const lyraDock = characterTokenDockOf(bia, 'Lyra');
  await expect(lyraDock).toContainText('Principal');
  await expect(lyraDock.getByRole('button', { name: 'Editar PV de Lyra' })).toBeVisible();

  // Unlinked, the token is no longer hers to show: the foot is the character, and its PV edits.
  await unlinkCenterToken(admin, 'Lyra');
  const ownDock = characterDockOf(bia, 'Lyra');
  await expect(ownDock).toContainText('Sem token neste grid');
  await hurtFromTheDock(ownDock);

  // Linked again, the token wears the hurt character.
  await linkCenterTokenToCharacter(admin, 'Lyra', 'Lyra');
  await expect(characterTokenDockOf(bia, 'Lyra')).toContainText('8 / 10');

  // Another token she sees takes the place; "Fechar ficha" brings Lyra back.
  await createTokenFor(admin, 'Kael', 'Bia');
  await openCard(bia, 'Kael');
  await bia
    .getByRole('region', { name: 'Token selecionado' })
    .getByRole('button', { name: 'Fechar ficha' })
    .click();
  await expect(characterTokenDockOf(bia, 'Lyra')).toBeVisible();

  await bia.reload();
  await bia.getByRole('tab', { name: 'Combate' }).click();
  await expect(characterTokenDockOf(bia, 'Lyra')).toContainText('8 / 10');
});
