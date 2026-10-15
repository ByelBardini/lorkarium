import { expect, test, type Page } from '@playwright/test';

// The admin the server seeds at boot (ADMIN_EMAIL / ADMIN_PASSWORD); there is no sign-up yet.
function adminCredentials(): { email: string; password: string } {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      `the home e2e signs in with the seeded admin; expected ADMIN_EMAIL and ADMIN_PASSWORD, received ${email ?? 'nothing'} and ${password ? 'a password' : 'nothing'}`,
    );
  }
  return { email, password };
}

async function signIn(page: Page): Promise<void> {
  const { email, password } = adminCredentials();
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal' })).toBeVisible();
}

test('create a campaign, see its code, open it, enter the table and continue from the home', async ({
  page,
}) => {
  const name = `Mesa E2E ${Date.now()}`;
  await signIn(page);

  await page.getByRole('button', { name: 'Nova mesa' }).first().click();
  const create = page.getByRole('dialog', { name: 'Nova mesa' });
  await create.getByLabel('Nome da mesa').fill(name);
  await create.getByLabel('Sistema (opcional)').fill('Tormenta20');
  await create.getByRole('button', { name: 'Criar mesa' }).click();

  const created = page.getByRole('dialog', { name: 'Mesa criada' });
  await expect(created.getByText(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/)).toBeVisible();
  await created.getByRole('button', { name: 'Fechar' }).click();

  const row = page.getByRole('link', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.click();

  const detail = page.getByRole('dialog', { name });
  await detail.getByRole('button', { name: 'Entrar na mesa' }).click();
  await expect(page.getByText('O tabuleiro abre aqui.')).toBeVisible();

  await page.getByRole('link', { name: 'Voltar para as mesas' }).click();
  const band = page.getByRole('region', { name: 'Continuar' });
  await expect(band.getByRole('heading', { name })).toBeVisible();
});
