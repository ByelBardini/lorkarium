import { expect, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn, submitLogin } from './support/sign-in';
import { createTableAndReadCode, joinByCodeAndEnter } from './support/tables';

const MARINA = { email: 'marina@exemplo.com', password: 'senha-da-marina' };
const NEW_PASSWORD = 'senha-nova-da-marina';

// The link points at APP_PUBLIC_URL; the browser of the spec opens the same path on its client.
function pathOf(link: string): string {
  const url = new URL(link);
  return `${url.pathname}${url.hash}`;
}

async function openUsers(admin: Page): Promise<void> {
  await admin.goto('/admin/users');
  await expect(admin.getByRole('table', { name: 'Usuários' })).toBeVisible();
}

async function chooseFor(admin: Page, person: string, item: string): Promise<void> {
  await admin.getByRole('button', { name: `Ações de ${person}` }).click();
  await admin.getByRole('menuitem', { name: item }).click();
}

function rowOf(admin: Page, handle: string) {
  return admin.getByRole('row').filter({ hasText: handle });
}

async function inviteMarina(admin: Page): Promise<string> {
  await admin.getByRole('button', { name: 'Convidar' }).click();
  const sheet = admin.getByRole('dialog', { name: 'Convidar pessoa' });
  await sheet.getByLabel('E-mail').fill(MARINA.email);
  await sheet.getByRole('button', { name: 'Convidar' }).click();
  const field = admin.getByRole('textbox', { name: 'Link do convite' });
  await expect(field).toHaveValue(/\/invite#token=/);
  const link = await field.inputValue();
  await admin.keyboard.press('Escape');
  return link;
}

async function acceptAsMarina(marina: Page, link: string): Promise<void> {
  await marina.goto(pathOf(link));
  await expect(marina.getByText(`Convite para ${MARINA.email}`)).toBeVisible();
  await expect(marina.getByLabel('Seu @')).toHaveValue('marina');
  await marina.getByLabel('Senha', { exact: true }).fill(MARINA.password);
  await marina.getByLabel('Repita a senha', { exact: true }).fill(MARINA.password);
  await marina.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(marina.getByRole('navigation', { name: 'Principal' })).toBeVisible();
}

async function confirmIn(admin: Page, dialog: string, button: string): Promise<void> {
  await admin
    .getByRole('alertdialog', { name: dialog })
    .getByRole('button', { name: button })
    .click();
}

test.describe('backoffice', () => {
  test('invite, suspend, new password and delete', async ({ page: admin, newPlayerPage }) => {
    test.setTimeout(180_000);
    await signIn(admin, adminCredentials());
    await openUsers(admin);

    const link = await inviteMarina(admin);
    const marina = await newPlayerPage();
    await acceptAsMarina(marina, link);
    await admin.reload();
    await expect(rowOf(admin, '@marina')).toContainText('Ativo');

    await chooseFor(admin, 'marina', 'Suspender acesso');
    await confirmIn(admin, 'Suspender o acesso de @marina?', 'Suspender');
    await expect(admin.getByText('O acesso de @marina foi suspenso.')).toBeVisible();
    await marina.reload();
    await expect(marina).toHaveURL(/\/login/);
    await submitLogin(marina, MARINA);
    await expect(marina.getByRole('alert')).toHaveText(
      'Esta conta está suspensa. Fale com quem administra o Lorkarium.',
    );
    await chooseFor(admin, 'marina', 'Reativar acesso');
    await expect(admin.getByText('O acesso de @marina voltou.')).toBeVisible();
    await submitLogin(marina, MARINA);
    await expect(marina.getByRole('navigation', { name: 'Principal' })).toBeVisible();

    await chooseFor(admin, 'marina', 'Mandar link de nova senha');
    const resetField = admin.getByRole('textbox', { name: 'Link de nova senha' });
    await expect(resetField).toHaveValue(/\/reset-password#token=/);
    const resetLink = await resetField.inputValue();
    await admin.keyboard.press('Escape');
    await marina.goto(pathOf(resetLink));
    await expect(marina.getByRole('heading', { name: 'Nova senha para @marina' })).toBeVisible();
    await marina.getByLabel('Senha nova', { exact: true }).fill(NEW_PASSWORD);
    await marina.getByLabel('Repita a senha nova', { exact: true }).fill(NEW_PASSWORD);
    await marina.getByRole('button', { name: 'Trocar senha' }).click();
    await expect(marina.getByText('Senha trocada. Entre com a nova senha.')).toBeVisible();
    await submitLogin(marina, MARINA);
    await expect(marina.getByRole('alert')).toHaveText('E-mail ou senha incorretos.');
    await submitLogin(marina, { email: MARINA.email, password: NEW_PASSWORD });
    await expect(marina.getByRole('navigation', { name: 'Principal' })).toBeVisible();

    const bia = await newPlayerPage();
    await signIn(bia, BIA);
    const table = `Mesa da Bia ${Date.now()}`;
    const code = await createTableAndReadCode(bia, table);
    const caio = await newPlayerPage();
    await signIn(caio, CAIO);
    await joinByCodeAndEnter(caio, code, bia);
    await admin.reload();
    await chooseFor(admin, 'Bia', 'Excluir usuário');
    const blocked = admin.getByRole('alertdialog', { name: 'Excluir @bia?' });
    await expect(blocked.getByText('@bia criou mesas em que outras pessoas jogam:')).toBeVisible();
    await expect(blocked.getByText(`${table} (1 outra pessoa)`)).toBeVisible();
    await expect(blocked.getByRole('button', { name: 'Excluir' })).toHaveCount(0);
    await admin.keyboard.press('Escape');

    await chooseFor(admin, 'marina', 'Excluir usuário');
    const free = admin.getByRole('alertdialog', { name: 'Excluir @marina?' });
    await free.getByLabel('Digite @marina para confirmar').fill('@marina');
    await free.getByRole('button', { name: 'Excluir' }).click();
    await expect(admin.getByText('A conta @marina foi excluída.')).toBeVisible();
    await expect(rowOf(admin, '@marina')).toHaveCount(0);
  });

  test('the mail test sends one system e-mail to the typed address', async ({ page: admin }) => {
    await signIn(admin, adminCredentials());
    await admin.goto('/admin/emails');
    await admin.getByLabel('E-mail de destino').fill('teste@exemplo.com');
    await admin.getByRole('button', { name: 'Enviar Convite' }).click();
    await expect(admin.getByRole('status')).toHaveText(
      '“Seu convite para o Lorkarium” enviado para teste@exemplo.com.',
    );
  });
});
