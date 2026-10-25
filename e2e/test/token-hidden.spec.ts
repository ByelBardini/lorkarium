import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf, dragBetweenCells } from './support/board-cells';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { cardOf, createTokenFor, openCard } from './support/token-cards';

function sceneRowOf(page: Page, name: string): Locator {
  return page
    .getByRole('list', { name: 'Na cena' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
}

async function expectInScene(page: Page, name: string, count: 0 | 1): Promise<void> {
  await page.getByRole('tab', { name: 'Combate' }).click();
  await expect(sceneRowOf(page, name)).toHaveCount(count);
}

function hiddenSwitchOf(master: Page, name: string): Locator {
  return cardOf(master, name).getByRole('button', { name: 'Invisível para os jogadores' });
}

test('hidden token: the master hides the wolf, a player who does not control it never gets it, and an F5 keeps it so', async ({
  newPlayerPage,
}) => {
  // Three pages drawing PixiJS without a GPU, like layers.spec.
  test.setTimeout(240_000);
  const name = `Mesa invisível ${Date.now()}`;
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

  // The wolf is Bia's, out of the center where the next token lands; Kael is Caio's.
  await createTokenFor(admin, 'Lobo', 'Bia');
  await dragBetweenCells(admin, [10, 6], [4, 4]);
  await openCard(admin, 'Lobo');
  await expect(cardOf(admin, 'Lobo')).toContainText('Coluna 5, linha 5');
  await createTokenFor(admin, 'Kael', 'Caio');
  await expectInScene(caio, 'Lobo', 1);

  // "Tornar invisível" on the wolf's menu: Caio loses it, Bia (in control) keeps it.
  const wolf = await cellCenterOf(admin, 4, 4);
  await admin.mouse.click(wolf.x, wolf.y, { button: 'right' });
  const menu = admin.getByRole('menu', { name: 'Ações de Lobo' });
  await menu.getByRole('menuitem', { name: 'Tornar invisível' }).click();
  await expect(menu).toBeHidden();
  await expectInScene(caio, 'Lobo', 0);
  await expectInScene(caio, 'Kael', 1);
  await expectInScene(bia, 'Lobo', 1);
  await openCard(admin, 'Lobo');
  await expect(hiddenSwitchOf(admin, 'Lobo')).toHaveAttribute('aria-pressed', 'true');

  await caio.reload();
  await expectInScene(caio, 'Kael', 1);
  await expectInScene(caio, 'Lobo', 0);

  // Ctrl+Z shows it again; the switch on the card hides it once more.
  await admin.getByRole('application', { name: /^Tabuleiro/ }).focus();
  await admin.keyboard.press('Control+z');
  await expectInScene(caio, 'Lobo', 1);
  await openCard(admin, 'Lobo');
  await expect(hiddenSwitchOf(admin, 'Lobo')).toHaveAttribute('aria-pressed', 'false');
  await hiddenSwitchOf(admin, 'Lobo').click();
  await expect(hiddenSwitchOf(admin, 'Lobo')).toHaveAttribute('aria-pressed', 'true');
  await expectInScene(caio, 'Lobo', 0);
  await expectInScene(bia, 'Lobo', 1);
});
