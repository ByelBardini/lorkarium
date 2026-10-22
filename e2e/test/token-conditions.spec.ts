import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA } from './support/dev-players';
import { cellCenterOf } from './support/board-cells';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { createTokenFor } from './support/token-cards';

// A new token lands at the middle of the default scene.
const KAEL_CELL = [10, 6] as const;

function cardOf(page: Page): Locator {
  return page.getByRole('tooltip');
}

async function applyCondition(dock: Locator, name: string, rounds: string): Promise<void> {
  await dock.getByRole('combobox', { name: 'Adicionar condição' }).fill(name);
  await dock.getByLabel('Rodadas').fill(rounds);
  await dock.getByRole('button', { name: 'Aplicar' }).click();
  await expect(dock.getByRole('list', { name: 'Condições ativas de Kael' })).toContainText(name);
}

async function hoverKael(page: Page): Promise<void> {
  const at = await cellCenterOf(page, ...KAEL_CELL);
  await page.mouse.move(at.x - 20, at.y - 20);
  await page.mouse.move(at.x, at.y, { steps: 5 });
}

test('the card of a hovered token lists all its conditions, the looks first, then the heaviest, for everyone', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const name = `Mesa condições ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code);
  await enterFromTheList(admin, name);
  // The token's detail lives on the "Combate" tab; entering the table opens "Na mesa".
  await admin.getByRole('tab', { name: 'Combate' }).click();

  await createTokenFor(admin, 'Kael', 'Bia');
  await admin.getByRole('button', { name: 'Selecionar (V)' }).click();
  const kael = await cellCenterOf(admin, ...KAEL_CELL);
  await admin.mouse.click(kael.x, kael.y);
  const dock = admin.getByRole('region', { name: 'Token selecionado' });
  for (const [condition, rounds] of [
    ['Abençoado', ''],
    ['Envenenado', '2'],
    ['Paralisado', '1'],
    ['Cego', ''],
    ['Atordoado', '3'],
    ['Amedrontado', ''],
    ['Invisível', ''],
  ] as const) {
    await applyCondition(dock, condition, rounds);
  }
  await dock.getByRole('button', { name: 'Fechar ficha' }).click();

  const expected = [
    /^Invisível/,
    /^Paralisado.*1 rodada$/,
    /^Atordoado.*3 rodadas$/,
    /^Envenenado.*2 rodadas$/,
    /^Cego/,
    /^Amedrontado/,
    /^Abençoado.*sem limite$/,
  ];
  await hoverKael(admin);
  const card = cardOf(admin);
  await expect(card).toContainText('Kael');
  await expect(
    card.getByRole('list', { name: 'Condições de Kael' }).getByRole('listitem'),
  ).toHaveText(expected);

  // Off the token, the card goes away.
  const empty = await cellCenterOf(admin, 3, 3);
  await admin.mouse.move(empty.x, empty.y, { steps: 5 });
  await expect(card).toBeHidden();

  // Bia, in her own browser, gets the same card over the same token.
  await hoverKael(bia);
  await expect(
    cardOf(bia).getByRole('list', { name: 'Condições de Kael' }).getByRole('listitem'),
  ).toHaveText(expected);
});
