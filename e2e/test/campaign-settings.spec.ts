import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, joinByCodeAndEnter } from './support/tables';

const WIDE_IMAGE = fileURLToPath(new URL('./fixtures/mapa-1400x700.png', import.meta.url));

const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

function openTablesOf(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Mesas abertas' });
}

function settingsFormOf(page: Page): Locator {
  return page.getByRole('form', { name: 'Configurações da mesa' });
}

// "Nova mesa" with a cover and a status other than the defaults, back on the home with the code.
async function createWithCoverAndStatus(master: Page, name: string): Promise<string> {
  await master.getByRole('button', { name: 'Nova mesa' }).first().click();
  const create = master.getByRole('dialog', { name: 'Nova mesa' });
  await create.getByLabel('Nome da mesa').fill(name);
  await create
    .getByRole('radiogroup', { name: 'Status' })
    .getByRole('radio', { name: 'Recrutando' })
    .click();
  await create
    .getByRole('radiogroup', { name: 'Desenho' })
    .getByRole('radio', { name: 'Montanhas' })
    .click();
  await create
    .getByRole('radiogroup', { name: 'Tom' })
    .getByRole('radio', { name: 'Brasa' })
    .click();
  await create.getByRole('button', { name: 'Criar mesa' }).click();
  const created = master.getByRole('dialog', { name: 'Mesa criada' });
  const code = await readCode(created);
  await created.getByRole('button', { name: 'Fechar' }).click();
  return code;
}

async function readCode(scope: Locator): Promise<string> {
  const code = scope.getByText(CODE_PATTERN);
  await expect(code).toBeVisible();
  const text = await code.textContent();
  if (!text)
    throw new Error(`expected a code shaped like VHRN-7K2Q in ${String(scope)}, received nothing`);
  return text;
}

function settingsHeaderOf(page: Page): Locator {
  return page.getByRole('heading', { level: 1, name: 'Configurações da mesa' }).locator('..');
}

// The server only takes the settings of a table its master has open: in the room first, then
// its "Configurações da mesa" button.
async function enterAndOpenSettings(master: Page, name: string): Promise<void> {
  await master
    .getByRole('main')
    .getByRole('link', { name: new RegExp(name) })
    .click();
  await master
    .getByRole('dialog', { name })
    .getByRole('button', { name: 'Entrar na mesa' })
    .click();
  await expect(master).toHaveURL((url) => url.pathname.endsWith('/table'));
  await master.getByRole('link', { name: 'Configurações da mesa' }).click();
  await expect(master).toHaveURL((url) => url.pathname.endsWith('/table/settings'));
  await expect(settingsFormOf(master)).toBeVisible();
}

async function rename(master: Page, newName: string): Promise<void> {
  const form = settingsFormOf(master);
  await form.getByLabel('Nome da mesa', { exact: true }).fill(newName);
  const bar = form.getByRole('region', { name: 'Alterações da mesa' });
  await bar.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(bar.getByRole('status')).toHaveText('Tudo salvo.');
}

async function regenerateCode(master: Page, oldCode: string): Promise<string> {
  const form = settingsFormOf(master);
  await form.getByRole('button', { name: 'Gerar outro', exact: true }).click();
  await master
    .getByRole('alertdialog', { name: 'Gerar outro código?' })
    .getByRole('button', { name: 'Gerar outro código' })
    .click();
  await expect(form.getByText('Código novo gerado. O antigo não vale mais.')).toBeVisible();
  await expect(form.getByText(CODE_PATTERN)).not.toHaveText(oldCode);
  return readCode(form);
}

async function submitCode(page: Page, code: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Entrar com código' }).first().click();
  const join = page.getByRole('dialog', { name: 'Entrar numa mesa' });
  await join.getByLabel('Código da mesa').fill(code);
  await join.getByRole('button', { name: 'Entrar', exact: true }).click();
  return join;
}

async function deleteTable(master: Page, name: string): Promise<void> {
  await settingsFormOf(master).getByRole('button', { name: 'Excluir mesa', exact: true }).click();
  const confirm = master.getByRole('alertdialog', { name: `Excluir “${name}”?` });
  const deleteButton = confirm.getByRole('button', { name: 'Excluir para sempre' });
  await expect(deleteButton).toBeDisabled();
  await confirm.getByLabel(/Para confirmar, digite o nome da mesa/).fill(name);
  await deleteButton.click();
}

// A wide file in "Foto": the crop opens locked at 1:1, one zoom step, "Enviar"; back in the field,
// the chosen image's address (`/api/assets/<id>`).
async function sendCroppedPhoto(master: Page): Promise<string> {
  const photo = settingsFormOf(master).getByRole('group', { name: 'Foto', exact: true });
  await photo.getByLabel('Arquivo de imagem').setInputFiles(WIDE_IMAGE);
  const crop = master.getByRole('dialog', { name: 'Recortar a foto da mesa' });
  const send = crop.getByRole('button', { name: 'Enviar' });
  await expect(send).toBeEnabled();
  await crop.press('+');
  await expect(crop.getByText('1,1×', { exact: true })).toBeVisible();
  await send.click();
  await expect(crop).toBeHidden();
  const chosen = photo.getByRole('img', { name: 'Imagem escolhida' });
  await expect(chosen).toBeVisible();
  const src = await chosen.getAttribute('src');
  if (!src) throw new Error(`expected the photo field to show /api/assets/<id>, received ${src}`);
  return src;
}

type Decoded = Readonly<{ naturalWidth: number; naturalHeight: number }>;

// Runs in the page: the decoded size of the image the server stored, not the box it is shown in.
function proportionOf(img: unknown): number {
  const { naturalWidth, naturalHeight } = img as Decoded;
  return naturalHeight === 0 ? 0 : naturalWidth / naturalHeight;
}

async function saveSettings(master: Page): Promise<void> {
  const bar = settingsFormOf(master).getByRole('region', { name: 'Alterações da mesa' });
  await bar.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(bar.getByRole('status')).toHaveText('Tudo salvo.');
}

test('a cropped photo shows square on the home row; without a banner "Continuar" shows the cover', async ({
  newPlayerPage,
}) => {
  test.setTimeout(90_000);
  const name = `Mesa foto ${Date.now()}`;
  const bia = await newPlayerPage();
  await signIn(bia, BIA);
  await createTableAndReadCode(bia, name);
  await enterAndOpenSettings(bia, name);

  const photoSrc = await sendCroppedPhoto(bia);
  await saveSettings(bia);
  await bia.getByRole('link', { name: 'Voltar à mesa' }).click();
  await bia.getByRole('link', { name: 'Mesas', exact: true }).click();

  const row = bia.getByRole('main').getByRole('listitem').filter({ hasText: name });
  const rowImage = row.locator('img');
  await expect(rowImage).toHaveAttribute('src', photoSrc);
  await expect.poll(() => rowImage.evaluate(proportionOf)).toBe(1);
  const band = bia.getByRole('region', { name: 'Continuar' });
  await expect(band.getByRole('heading', { name })).toBeVisible();
  await expect(band.locator('[data-cover-drawing]')).toHaveCount(1);
  await expect(band.locator('img')).toHaveCount(0);
});

test('the master creates, renames, renews the code and deletes a table while a player is in it', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const name = `Mesa config ${stamp}`;
  const newName = `Mesa renomeada ${stamp}`;
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  const admin = await newPlayerPage();

  await signIn(bia, BIA);
  const oldCode = await createWithCoverAndStatus(bia, name);
  await enterAndOpenSettings(bia, name);
  await expect(settingsHeaderOf(bia)).toContainText(name);
  const form = settingsFormOf(bia);
  await expect(form.getByRole('radio', { name: 'Montanhas' })).toBeChecked();
  await expect(form.getByRole('radio', { name: 'Brasa' })).toBeChecked();
  await expect(form.getByRole('radio', { name: 'Recrutando' })).toBeChecked();

  await signIn(caio, CAIO);
  await joinByCodeAndEnter(caio, oldCode, bia);
  await expect(openTablesOf(caio).getByRole('link')).toContainText([name]);

  await rename(bia, newName);
  await expect(settingsHeaderOf(bia)).toContainText(newName);
  await expect(openTablesOf(caio).getByRole('link')).toContainText([newName]);

  const newCode = await regenerateCode(bia, oldCode);
  await signIn(admin, adminCredentials());
  const join = await submitCode(admin, oldCode);
  await expect(join.getByText('Nenhuma mesa com esse código.')).toBeVisible();
  await join.getByLabel('Código da mesa').fill(newCode);
  await join.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(admin.getByRole('dialog', { name: newName })).toBeVisible();

  await deleteTable(bia, newName);
  await expect(bia).toHaveURL((url) => url.pathname === '/');
  await expect(caio).toHaveURL((url) => url.pathname === '/');
  await expect(
    caio.getByRole('alert').filter({ hasText: `A mesa “${newName}” foi excluída pelo mestre.` }),
  ).toBeVisible();
  await expect(openTablesOf(caio)).toHaveCount(0);
});
