import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { mailedLink, mailpitApiUrl } from './support/mailbox';

// The e2e server runs with REGISTRATION_OPEN=true and no Turnstile keys: the client skips the
// widget and the server's SkippedHumanCheck accepts the request (the widget has its own specs).
test.skip(!mailpitApiUrl(), 'reads the mailed links: needs E2E_SMTP_URL and E2E_MAILPIT_API_URL');

const PASSWORD = 'senha-do-cadastro-1';

function freshEmail(): string {
  return `cadastro-${randomUUID().slice(0, 8)}@exemplo.com`;
}

async function askToSignUp(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Criar conta' }).click();
  // Without waiting, the non-exact label still finds "E-mail ou usuário" of the login.
  await expect(page.getByRole('heading', { name: 'Crie sua conta' })).toBeVisible();
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('status')).toContainText(`Mandamos um e-mail para ${email}`);
}

async function signUp(page: Page, email: string): Promise<string> {
  await askToSignUp(page, email);
  await page.goto(
    await mailedLink(email, 'Confirme seu cadastro no Lorkarium', '/sign-up/confirm'),
  );
  await expect(page.getByText(`Cadastro de ${email}`)).toBeVisible();
  const username = await page.getByLabel('Seu @').inputValue();
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Repita a senha').fill(PASSWORD);
  await page.getByRole('checkbox', { name: /Tenho 18 anos ou mais/ }).check();
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
  return username;
}

async function signOut(page: Page): Promise<void> {
  await page.context().clearCookies();
}

test('signs up by e-mail and lands signed in at home', async ({ page }) => {
  const username = await signUp(page, freshEmail());
  expect(username).toMatch(/^cadastro[0-9a-f]{8}$/);
});

test('asking again with a taken e-mail shows the same screen and mails "você já tem conta"', async ({
  page,
}) => {
  const email = freshEmail();
  await signUp(page, email);
  await signOut(page);
  await askToSignUp(page, email);
  const link = await mailedLink(email, 'Você já tem uma conta no Lorkarium', '/reset-password');
  expect(link).toMatch(/^\/reset-password#token=/);
});

test('"Esqueci minha senha" by the @ mails a link that sets a new password', async ({ page }) => {
  const email = freshEmail();
  const username = await signUp(page, email);
  await signOut(page);
  await page.goto('/login');
  await page.getByLabel('E-mail ou usuário').fill(`@${username}`);
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await expect(page.getByLabel('E-mail ou @')).toHaveValue(`@${username}`);
  await page.getByRole('button', { name: 'Mandar link' }).click();
  await expect(page.getByRole('status')).toContainText('Se existir uma conta');
  await page.goto(await mailedLink(email, 'Crie uma senha nova no Lorkarium', '/reset-password'));
  const fresh = 'senha-nova-do-teste-2';
  await page.getByLabel('Senha nova', { exact: true }).fill(fresh);
  await page.getByLabel('Repita a senha nova').fill(fresh);
  await page.getByRole('button', { name: 'Trocar senha' }).click();
  await page.getByRole('link', { name: 'Entrar' }).click();
  await page.getByLabel('E-mail ou usuário').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(fresh);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
});
