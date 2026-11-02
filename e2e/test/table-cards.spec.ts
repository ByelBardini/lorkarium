import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';
import {
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
  openRoomPeople,
  presenceOf,
} from './support/tables';
import { createCharacterTokenWithPv } from './support/token-cards';

function playerCardOf(page: Page, character: string): Locator {
  return page
    .getByRole('region', { name: /^Jogadores/ })
    .getByRole('article', { name: character, exact: true });
}

test('the card and the presence reach the other browser, and a reload keeps the card', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const name = `Mesa fichas ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, name);
  await expect(presenceOf(admin, 'Bia')).toHaveAccessibleName('online');
  await createCharacterTokenWithPv(admin, 'Lyra', 'Bia');
  await admin.getByRole('tab', { name: 'Na mesa' }).click();

  // Bia writes her CA and a nickname on her own card; the master sees both.
  const ownCard = playerCardOf(bia, 'Lyra');
  const armor = ownCard.getByRole('textbox', { name: 'CA de Lyra' });
  await armor.fill('15');
  await armor.press('Enter');
  await ownCard.getByRole('button', { name: 'Mudar o nome de Lyra' }).click();
  const nickname = bia.getByRole('textbox', { name: 'Nome do personagem' });
  await nickname.fill('Lyra Vandel');
  await nickname.press('Enter');
  const seenByMaster = playerCardOf(admin, 'Lyra Vandel');
  await expect(seenByMaster.getByRole('textbox', { name: 'CA de Lyra Vandel' })).toHaveValue('15');

  // A double click on her PV opens the balloon; "−3" reaches the master.
  await playerCardOf(bia, 'Lyra Vandel')
    .getByRole('button', { name: 'Editar PV de Lyra Vandel' })
    .dblclick();
  const current = bia.getByRole('dialog', { name: 'PV' }).getByRole('textbox', { name: 'Atual' });
  await current.fill('−3');
  await current.press('Enter');
  await expect(seenByMaster.getByRole('meter', { name: 'PV de Lyra Vandel' })).toHaveText('7 / 10');

  await bia.reload();
  await openRoomPeople(bia);
  await expect(
    playerCardOf(bia, 'Lyra Vandel').getByRole('textbox', { name: 'CA de Lyra Vandel' }),
  ).toHaveValue('15');
});
