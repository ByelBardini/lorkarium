import { expect, type APIResponse, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { campaignIdOf } from './support/documents';
import { openLibrary, openNewItem } from './support/library';
import { test } from './support/player-pages';
import { setPlanOf } from './support/plans';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';

// A new table is born with one grid; four more fill the Grátis ceiling of 5.
const GRIDS_TO_FILL_THE_FREE_CEILING = 4;

async function changePlanInBackoffice(
  admin: Page,
  person: string,
  planName: string,
): Promise<void> {
  await admin.goto('/admin/users');
  await expect(admin.getByRole('table', { name: 'Usuários' })).toBeVisible();
  await admin.getByRole('button', { name: `Ações de ${person}` }).click();
  await admin.getByRole('menuitem', { name: 'Plano' }).click();
  await admin.getByRole('menuitemradio', { name: planName }).click();
}

async function createGridByApi(master: Page, campaignId: string): Promise<APIResponse> {
  return master.request.post(`/api/campaigns/${campaignId}/scenes`, { data: {} });
}

function newTableButtonOf(page: Page): Locator {
  return page.getByRole('button', { name: 'Nova mesa' }).first();
}

test.describe('plans', () => {
  // Bia goes down and up the grid in these tests; every other group expects her seeded plan.
  test.afterEach(async ({ page: admin }) => {
    await signIn(admin, adminCredentials());
    await setPlanOf(admin, 'bia', 'amigo_do_dono');
  });

  test('a Grátis owner of one table sees "Nova mesa" off', async ({
    page: admin,
    newPlayerPage,
  }) => {
    await signIn(admin, adminCredentials());
    const bia = await newPlayerPage();
    await signIn(bia, BIA);
    await createTableAndReadCode(bia, 'Mesa grátis da Bia');
    await expect(newTableButtonOf(bia)).toBeEnabled();

    await changePlanInBackoffice(admin, 'Bia', 'Grátis');
    await expect(admin.getByText('@bia agora está no plano Grátis.')).toBeVisible();

    await bia.reload();
    await expect(newTableButtonOf(bia)).toBeDisabled();
    await expect(newTableButtonOf(bia)).toHaveAccessibleDescription(
      /^Seu plano Grátis permite até 1 mesa como dono\./,
    );
  });

  test('the Lenda seal reaches the card of Bia live', async ({ page: admin, newPlayerPage }) => {
    await signIn(admin, adminCredentials());
    const bia = await newPlayerPage();
    await signIn(bia, BIA);
    const code = await createTableAndReadCode(bia, 'Mesa Lenda da Bia');
    await enterFromTheList(bia, 'Mesa Lenda da Bia');
    const caio = await newPlayerPage();
    await signIn(caio, CAIO);
    await joinByCodeAndEnter(caio, code, bia);

    await caio
      .getByRole('region', { name: 'Na mesa' })
      .getByRole('button', { name: 'Bia', exact: true })
      .click();
    const card = caio.getByRole('dialog', { name: 'Cartão de Bia' });
    await expect(card.getByRole('img', { name: 'Amigo do Dono' })).toBeVisible();

    await changePlanInBackoffice(admin, 'Bia', 'Lenda');
    await expect(admin.getByText('@bia agora está no plano Lenda.')).toBeVisible();

    await expect(card.getByRole('img', { name: 'Plano Lenda' })).toBeVisible();
    await expect(card.getByRole('img', { name: 'Amigo do Dono' })).toHaveCount(0);
  });

  test('the 6th grid of a Grátis table is refused with the plan sentence', async ({
    page: admin,
    newPlayerPage,
  }) => {
    await signIn(admin, adminCredentials());
    const bia = await newPlayerPage();
    await signIn(bia, BIA);
    await createTableAndReadCode(bia, 'Mesa de cinco grids');
    await setPlanOf(admin, 'bia', 'free');
    await enterFromTheList(bia, 'Mesa de cinco grids');
    const campaignId = campaignIdOf(bia);
    for (let grid = 0; grid < GRIDS_TO_FILL_THE_FREE_CEILING; grid += 1) {
      expect((await createGridByApi(bia, campaignId)).status()).toBe(201);
    }

    const sentence = 'Esta mesa usa o plano Grátis, que permite até 5 grids. O Narrador libera 20.';
    const library = await openLibrary(bia);
    await openNewItem(library);
    const gridCard = bia
      .getByRole('dialog', { name: 'Novo item', exact: true })
      .getByRole('button', { name: 'Grid', exact: true });
    await expect(gridCard).toBeDisabled();
    await expect(gridCard).toHaveAccessibleDescription(sentence);

    const refused = await createGridByApi(bia, campaignId);
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({
      code: 'PLAN_LIMIT',
      planLimit: { resource: 'scenes', limit: 5, plan: 'free' },
    });
  });

  test('Caio, Amigo do Dono, creates a second table as usual', async ({ newPlayerPage }) => {
    const caio = await newPlayerPage();
    await signIn(caio, CAIO);
    await createTableAndReadCode(caio, 'Primeira mesa do Caio');
    await expect(newTableButtonOf(caio)).toBeEnabled();
    const code = await createTableAndReadCode(caio, 'Segunda mesa do Caio');
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    await expect(caio.getByRole('link', { name: /Segunda mesa do Caio/ })).toBeVisible();
  });
});
