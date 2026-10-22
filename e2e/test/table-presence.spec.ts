import { expect } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';
import {
  GRACE_AND_MARGIN_MS,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
  presenceOf,
} from './support/tables';

test('two people at the same table see each other online, and a closed page goes offline', async ({
  newPlayerPage,
}) => {
  const name = `Mesa ao vivo ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);

  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code);
  await enterFromTheList(admin, name);

  await expect(presenceOf(admin, 'Bia')).toHaveAccessibleName('online');
  await expect(presenceOf(bia, 'Admin')).toHaveAccessibleName('online');

  await bia.close();
  await expect(presenceOf(admin, 'Bia')).toHaveAccessibleName('offline', {
    timeout: GRACE_AND_MARGIN_MS,
  });
});
