import { expect, type APIResponse, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { campaignIdOf } from './support/documents';
import {
  closeLibrary,
  gridItemOf,
  gridTabsOf,
  openItemOf,
  openLibrary,
  openNewItem,
} from './support/library';
import { test } from './support/player-pages';
import { setPlanOf } from './support/plans';
import { adminCredentials, signIn } from './support/sign-in';
import { statusOf } from './support/token-cards';
import {
  boardOf,
  chooseFromTableMenu,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';

// A new table is born with one grid; two more fill the Grátis ceiling of 3.
const GRIDS_TO_FILL_THE_FREE_CEILING = 2;

const LOCKED_GRID_SENTENCE =
  'Este grid passou do limite do plano Grátis (3) e está só leitura. Apague um grid mais antigo ou suba de plano.';

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

async function createGridByApi(
  master: Page,
  campaignId: string,
  name?: string,
): Promise<APIResponse> {
  return master.request.post(`/api/campaigns/${campaignId}/scenes`, {
    data: name === undefined ? {} : { name },
  });
}

function newItemCardOf(page: Page, kind: string): Locator {
  return page
    .getByRole('dialog', { name: 'Novo item', exact: true })
    .getByRole('button', { name: kind, exact: true });
}

function toolOf(page: Page, name: string): Locator {
  return page
    .getByRole('toolbar', { name: 'Ferramentas do tabuleiro' })
    .getByRole('button', { name });
}

/** A token of the master's own (nobody in control) at the center cell (10, 6) of the view. */
async function createMasterToken(master: Page, name: string): Promise<void> {
  await master.getByRole('button', { name: 'Novo token' }).click();
  const dialog = master.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
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

  // The roster's seal follows the plan live; the profile card is read when it opens.
  test('the Lenda seal reaches the roster live and the card of Bia on reopening', async ({
    page: admin,
    newPlayerPage,
  }) => {
    await signIn(admin, adminCredentials());
    const bia = await newPlayerPage();
    await signIn(bia, BIA);
    const code = await createTableAndReadCode(bia, 'Mesa Lenda da Bia');
    await enterFromTheList(bia, 'Mesa Lenda da Bia');
    const caio = await newPlayerPage();
    await signIn(caio, CAIO);
    await joinByCodeAndEnter(caio, code, bia);
    const roster = caio.getByRole('region', { name: 'Na mesa' });
    const nickOfBia = roster.getByTestId('nick-line').filter({ hasText: 'Bia' });
    await expect(nickOfBia.getByRole('img', { name: 'Amigo do Dono' })).toBeVisible();

    await changePlanInBackoffice(admin, 'Bia', 'Lenda');
    await expect(admin.getByText('@bia agora está no plano Lenda.')).toBeVisible();

    await expect(nickOfBia.getByRole('img', { name: 'Plano Lenda' })).toBeVisible();
    await roster.getByRole('button', { name: 'Bia', exact: true }).click();
    const card = caio.getByRole('dialog', { name: 'Perfil de Bia' });
    await expect(card.getByRole('img', { name: 'Plano Lenda' })).toBeVisible();
    await expect(card.getByRole('img', { name: 'Amigo do Dono' })).toHaveCount(0);
  });

  test('the 4th grid of a Grátis table is refused with the plan sentence; Mapa is off', async ({
    page: admin,
    newPlayerPage,
  }) => {
    await signIn(admin, adminCredentials());
    const bia = await newPlayerPage();
    await signIn(bia, BIA);
    await createTableAndReadCode(bia, 'Mesa de três grids');
    await setPlanOf(admin, 'bia', 'free');
    await enterFromTheList(bia, 'Mesa de três grids');
    const campaignId = campaignIdOf(bia);
    for (let grid = 0; grid < GRIDS_TO_FILL_THE_FREE_CEILING; grid += 1) {
      expect((await createGridByApi(bia, campaignId)).status()).toBe(201);
    }

    const sentence = 'Esta mesa usa o plano Grátis, que permite até 3 grids. O Narrador libera 15.';
    const library = await openLibrary(bia);
    await openNewItem(library);
    const gridCard = newItemCardOf(bia, 'Grid');
    await expect(gridCard).toBeDisabled();
    await expect(gridCard).toHaveAccessibleDescription(sentence);
    const mapCard = newItemCardOf(bia, 'Mapa');
    await expect(mapCard).toBeDisabled();
    await expect(mapCard).toHaveAccessibleDescription('Disponível no plano Narrador');

    const refused = await createGridByApi(bia, campaignId);
    expect(refused.status()).toBe(403);
    expect(await refused.json()).toMatchObject({
      code: 'PLAN_LIMIT',
      planLimit: { resource: 'scenes', limit: 3, plan: 'free', reason: 'room' },
    });
  });

  // Built above the plan, then gone down: the newest grid past the 3 is read only, the game is not.
  test('the grid past the Grátis ceiling is read only, and its token still moves', async ({
    page: admin,
    newPlayerPage,
  }) => {
    test.setTimeout(90_000);
    await signIn(admin, adminCredentials());
    const bia = await newPlayerPage();
    await signIn(bia, BIA);
    await createTableAndReadCode(bia, 'Mesa do excedente');
    await enterFromTheList(bia, 'Mesa do excedente');
    const campaignId = campaignIdOf(bia);
    for (const name of ['Grid 2', 'Grid 3', 'Grid sobrando']) {
      expect((await createGridByApi(bia, campaignId, name)).status()).toBe(201);
    }
    await openItemOf(await openLibrary(bia), 'Grid sobrando');
    await closeLibrary(bia);
    await expect(gridTabsOf(bia).getByRole('tab', { selected: true })).toHaveText(/Grid sobrando/);
    await createMasterToken(bia, 'Sentinela');

    await setPlanOf(admin, 'bia', 'free');
    await bia.reload();
    const library = await openLibrary(bia);
    const lockOf = (grid: string): Locator =>
      gridItemOf(library, grid).getByRole('img', { name: 'Só leitura' });
    await expect(lockOf('Grid sobrando')).toBeVisible();
    await expect(lockOf('Grid 3')).toHaveCount(0);
    await gridItemOf(library, 'Grid sobrando').click({ button: 'right' });
    for (const name of ['Renomear', 'Duplicar']) {
      const entry = bia.getByRole('menuitem', { name, exact: true });
      await expect(entry).toHaveAttribute('aria-disabled', 'true');
      await expect(entry).toHaveAccessibleDescription(LOCKED_GRID_SENTENCE);
    }
    await expect(bia.getByRole('menuitem', { name: 'Excluir grid' })).not.toHaveAttribute(
      'aria-disabled',
    );
    await bia.keyboard.press('Escape');

    await openItemOf(library, 'Grid sobrando');
    await closeLibrary(bia);
    await expect(toolOf(bia, 'Paredes (P)')).toBeDisabled();
    await boardOf(bia).focus();
    await bia.keyboard.press(']');
    await expect(statusOf(bia)).toContainText('Sentinela selecionado, coluna 11, linha 7');
    await bia.keyboard.press('ArrowRight');
    await expect(statusOf(bia)).toContainText('Sentinela foi para a coluna 12, linha 7');
  });

  // Created before the plan went down: the table stays private (grandfathering), but the cover
  // and the banner now come from the photo, their pickers locked with the plan's hint.
  test('a Grátis owner keeps a private table; the cover picker points to the photo', async ({
    page: admin,
    newPlayerPage,
  }) => {
    await signIn(admin, adminCredentials());
    const bia = await newPlayerPage();
    await signIn(bia, BIA);
    await createTableAndReadCode(bia, 'Mesa da foto da Bia');
    await setPlanOf(admin, 'bia', 'free');

    await bia.reload();
    await enterFromTheList(bia, 'Mesa da foto da Bia');
    await chooseFromTableMenu(bia, 'Configurações da mesa');
    const form = bia.getByRole('form', { name: 'Configurações da mesa' });
    const cover = form.getByRole('group', { name: 'Capa', exact: true });
    await expect(cover).toContainText('A mesa usa a foto. Disponível no plano Narrador');
    await expect(cover.locator('fieldset')).toHaveAttribute('disabled', '');
    const visibility = form.getByRole('radiogroup', { name: 'Visibilidade' });
    await expect(visibility.getByRole('radio', { name: 'Privada' })).toBeChecked();
  });

  test('Caio on Apoiador keeps 15 saved rolls at the Grátis table of Bia, who keeps 3', async ({
    page: admin,
    newPlayerPage,
  }) => {
    await signIn(admin, adminCredentials());
    const bia = await newPlayerPage();
    await signIn(bia, BIA);
    const caio = await newPlayerPage();
    await signIn(caio, CAIO);
    const code = await createTableAndReadCode(bia, `Mesa das rolagens ${Date.now()}`);
    await joinByCodeAndEnter(caio, code, bia);
    const rollsUrl = `/api/campaigns/${campaignIdOf(caio)}/saved-rolls`;
    const save = (page: Page, name: string) =>
      page.request.post(rollsUrl, { data: { name, parts: [{ label: null, expression: '1d20' }] } });
    await setPlanOf(admin, 'bia', 'free');
    await setPlanOf(admin, 'caio', 'apoiador');

    try {
      for (const name of ['R1', 'R2', 'R3', 'R4'])
        expect((await save(caio, name)).status()).toBe(201);
      for (const name of ['B1', 'B2', 'B3']) expect((await save(bia, name)).status()).toBe(201);
      const fourthOfBia = await save(bia, 'B4');

      expect(fourthOfBia.status()).toBe(403);
      expect((await fourthOfBia.json()).planLimit).toMatchObject({
        resource: 'savedRolls',
        limit: 3,
        plan: 'free',
        holder: 'table',
      });
    } finally {
      await setPlanOf(admin, 'caio', 'amigo_do_dono');
    }
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
