import { expect, test } from '@playwright/test';
import { adminCredentials, signIn } from './support/sign-in';
import { boardOf } from './support/tables';

test('create a campaign, see its code, open it, enter the table and continue from the home', async ({
  page,
}) => {
  const name = `Mesa E2E ${Date.now()}`;
  await signIn(page, adminCredentials());

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
  await expect(boardOf(page)).toBeVisible();

  await page.getByRole('link', { name: 'Mesas', exact: true }).click();
  const band = page.getByRole('region', { name: 'Continuar' });
  await expect(band.getByRole('heading', { name })).toBeVisible();
});
