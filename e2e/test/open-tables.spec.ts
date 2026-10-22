import { expect, type Locator, type Page } from '@playwright/test';
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

// Below the 5 s grace period: going offline this fast proves a session:leave, not a drop.
const LEAVE_MS = 3_000;

function openTablesOf(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Mesas abertas' });
}

test('Bia stays online at two tables at once, an F5 keeps her there, and leaving from the rail takes her out of one', async ({
  newPlayerPage,
}) => {
  // It waits out the grace period on purpose; the 30 s default leaves no room on a cold client.
  test.setTimeout(60_000);
  const stamp = Date.now();
  const [tableA, tableB] = [`Mesa A ${stamp}`, `Mesa B ${stamp}`];
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const codeA = await createTableAndReadCode(admin, tableA);
  const codeB = await createTableAndReadCode(admin, tableB);

  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, codeA);
  await bia.getByRole('link', { name: 'Mesas', exact: true }).click();
  await joinByCodeAndEnter(bia, codeB);
  await enterFromTheList(admin, tableA);

  await expect(presenceOf(admin, 'Bia')).toHaveAccessibleName('online');
  await expect(openTablesOf(bia).getByRole('link')).toHaveText([
    new RegExp(tableA),
    new RegExp(tableB),
  ]);

  await bia.reload();
  await expect(openTablesOf(bia).getByRole('link')).toHaveText([
    new RegExp(tableA),
    new RegExp(tableB),
  ]);
  await admin.waitForTimeout(GRACE_AND_MARGIN_MS);
  await expect(presenceOf(admin, 'Bia')).toHaveAccessibleName('online');

  await openTablesOf(bia)
    .getByRole('link', { name: new RegExp(tableA) })
    .click({ button: 'right' });
  await bia.getByRole('menuitem', { name: 'Sair da mesa' }).click();
  await expect(presenceOf(admin, 'Bia')).toHaveAccessibleName('offline', { timeout: LEAVE_MS });
  await expect(openTablesOf(bia).getByRole('link')).toHaveText([new RegExp(tableB)]);
});
