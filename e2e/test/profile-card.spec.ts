import { readFile } from 'node:fs/promises';
import { expect, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { setPlanOf } from './support/plans';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';

type SeatedPair = Readonly<{ bia: Page; caio: Page }>;

// Bia owns the table and Caio joins it: sharing a table is what lets one vote on the other.
async function seatBiaAndCaio(
  newPlayerPage: () => Promise<Page>,
  table: string,
): Promise<SeatedPair> {
  const bia = await newPlayerPage();
  await signIn(bia, BIA);
  const code = await createTableAndReadCode(bia, table);
  await enterFromTheList(bia, table);
  const caio = await newPlayerPage();
  await signIn(caio, CAIO);
  await joinByCodeAndEnter(caio, code, bia);
  return { bia, caio };
}

async function openCardFromRoster(page: Page, name: string): Promise<Locator> {
  await page
    .getByRole('region', { name: 'Na mesa' })
    .getByRole('button', { name, exact: true })
    .first()
    .click();
  const card = page.getByRole('dialog', { name: `Perfil de ${name}` });
  await expect(card.getByText('Rolagens')).toBeVisible();
  return card;
}

async function closeCard(page: Page, card: Locator): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
}

test.describe('profile card', () => {
  test('Bia opens the card of Caio from the roster and reads his attributes', async ({
    newPlayerPage,
  }) => {
    const { bia } = await seatBiaAndCaio(newPlayerPage, `Mesa do card ${Date.now()}`);

    const card = await openCardFromRoster(bia, 'Caio');

    for (const attribute of ['Rolagens', 'Críticos', 'Mestre / joga', 'Aprovação']) {
      await expect(card.getByText(attribute, { exact: true })).toBeVisible();
    }
    await expect(card.getByText('Sem votos suficientes')).toBeVisible();
    await expect(card.getByText(/^Desde \d{2}\/\d{2}\/\d{4}$/)).toBeVisible();
  });

  test('a 👍 from Bia shows as 1 vote on the own card of Caio', async ({ newPlayerPage }) => {
    const { bia, caio } = await seatBiaAndCaio(newPlayerPage, `Mesa do voto ${Date.now()}`);

    const card = await openCardFromRoster(bia, 'Caio');
    await card.getByRole('button', { name: 'Aprovar, 0 votos' }).click();
    await expect(card.getByRole('button', { name: 'Aprovar, 1 voto' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const own = await openCardFromRoster(caio, 'Caio');
    await expect(own.getByRole('img', { name: 'Aprovações, 1 voto' })).toBeVisible();
    await expect(own.getByRole('button', { name: /^Aprovar/ })).toHaveCount(0);
  });

  test('Bia reports Caio and the admin resolves it in Denúncias', async ({
    page: admin,
    newPlayerPage,
  }) => {
    const { bia } = await seatBiaAndCaio(newPlayerPage, `Mesa da denúncia ${Date.now()}`);
    const details = `Spam no chat ${Date.now()}`;

    const card = await openCardFromRoster(bia, 'Caio');
    await card.getByRole('button', { name: 'Mais ações' }).click();
    await bia.getByRole('menuitem', { name: 'Denunciar' }).click();
    const report = bia.getByRole('dialog', { name: 'Denunciar Caio' });
    await report.getByRole('radio', { name: 'Spam' }).check();
    await report.getByLabel('Detalhes (opcional)').fill(details);
    await report.getByRole('button', { name: 'Enviar denúncia' }).click();
    await expect(report.getByText('Denúncia enviada.')).toBeVisible();

    await signIn(admin, adminCredentials());
    await admin.goto('/admin/reports');
    const row = admin.getByRole('table', { name: 'Denúncias abertas' }).getByRole('row', {
      name: new RegExp(details),
    });
    await expect(row).toContainText('@bia');
    await expect(row).toContainText('Spam');
    await row.getByRole('button', { name: 'Resolver' }).click();
    await expect(admin.getByText(details)).toHaveCount(0);
  });

  test('a Grátis account shows no image banner on its card', async ({
    page: admin,
    newPlayerPage,
  }) => {
    await signIn(admin, adminCredentials());
    const { bia, caio } = await seatBiaAndCaio(newPlayerPage, `Mesa do banner ${Date.now()}`);
    const sent = await caio.request.put('/api/account/banner', {
      headers: { 'content-type': 'image/png' },
      data: await readFile(new URL('./fixtures/mapa-1400x700.png', import.meta.url)),
    });
    expect(sent.status(), await sent.text()).toBe(200);

    try {
      const paid = await openCardFromRoster(bia, 'Caio');
      await expect(paid.getByTestId('profile-card-banner-image')).toBeVisible();
      await closeCard(bia, paid);

      await setPlanOf(admin, 'caio', 'free');
      const free = await openCardFromRoster(bia, 'Caio');
      await expect(free.getByTestId('profile-card-banner')).toBeVisible();
      await expect(free.getByTestId('profile-card-banner-image')).toHaveCount(0);
    } finally {
      await setPlanOf(admin, 'caio', 'amigo_do_dono');
      await caio.request.delete('/api/account/banner');
    }
  });
});
