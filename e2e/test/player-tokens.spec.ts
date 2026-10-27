import { expect, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { cardOf, chooseController, openCard } from './support/token-cards';

const CREATE_SETTING = 'Jogadores criam e editam tokens';
const DELETE_SETTING = 'Jogadores excluem os próprios tokens';

function settingsFormOf(page: Page): Locator {
  return page.getByRole('form', { name: 'Configurações da mesa' });
}

// The server only takes the settings of a table its master has open: from the room, then back.
async function setTokenSettings(
  master: Page,
  settings: Readonly<Record<string, boolean>>,
): Promise<void> {
  await master.getByRole('link', { name: 'Configurações da mesa' }).click();
  const form = settingsFormOf(master);
  await expect(form).toBeVisible();
  for (const [name, on] of Object.entries(settings)) {
    await form.getByRole('switch', { name }).setChecked(on);
  }
  const bar = form.getByRole('region', { name: 'Alterações da mesa' });
  await bar.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(bar.getByRole('status')).toHaveText('Tudo salvo.');
  await master.getByRole('link', { name: 'Voltar à mesa' }).click();
  await expect(master).toHaveURL((url) => url.pathname.endsWith('/table'));
}

async function openEditDialog(page: Page, name: string): Promise<Locator> {
  await openCard(page, name);
  await cardOf(page, name).getByRole('button', { name: 'Editar token' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar token' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test('player tokens: with the settings on, Bia creates and shares her own token, stays in control, and loses delete live without F5', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const name = `Mesa tokens dos jogadores ${Date.now()}`;
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
  await expect(bia.getByRole('button', { name: 'Novo token' })).toHaveCount(0);

  await setTokenSettings(admin, { [CREATE_SETTING]: true, [DELETE_SETTING]: true });

  await bia.getByRole('button', { name: 'Novo token' }).click();
  const create = bia.getByRole('dialog', { name: 'Novo token' });
  await expect(create.getByRole('tab', { name: /^Visão e luz/ })).toHaveCount(0);
  await create.getByLabel('Nome').fill('Corvo');
  await expect(create.getByRole('button', { name: 'Bia', exact: true })).toBeDisabled();
  await create.getByRole('button', { name: 'Criar token' }).click();
  await expect(create).toBeHidden();
  await openCard(admin, 'Corvo');

  const edit = await openEditDialog(bia, 'Corvo');
  const biaControl = edit.getByRole('button', { name: 'Bia', exact: true });
  await expect(biaControl).toHaveAttribute('aria-pressed', 'true');
  await expect(biaControl).toBeDisabled();
  await chooseController(edit, 'Caio');
  await edit.getByRole('button', { name: 'Salvar' }).click();
  await expect(edit).toBeHidden();
  await openCard(caio, 'Corvo');

  const reopened = await openEditDialog(bia, 'Corvo');
  await expect(reopened.getByRole('button', { name: 'Excluir token' })).toBeVisible();
  await setTokenSettings(admin, { [DELETE_SETTING]: false });
  await expect(reopened.getByRole('button', { name: 'Excluir token' })).toHaveCount(0);
  await expect(reopened.getByRole('button', { name: 'Bia', exact: true })).toBeDisabled();
  await reopened.getByRole('button', { name: 'Cancelar' }).click();

  await bia.reload();
  const afterReload = await openEditDialog(bia, 'Corvo');
  await expect(afterReload.getByRole('button', { name: 'Caio', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(afterReload.getByRole('button', { name: 'Excluir token' })).toHaveCount(0);
});
