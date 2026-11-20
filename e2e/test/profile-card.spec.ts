import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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

const SCREENSHOT = fileURLToPath(new URL('./fixtures/mapa-1400x700.png', import.meta.url));

// The thumbnail comes from the admin-only route: decoded means the server served the image.
async function reviewScreenshotOf(admin: Page, row: Locator): Promise<void> {
  await row.getByRole('button', { name: 'Abrir' }).click();
  const detail = admin.getByRole('dialog', { name: 'Denúncia de @bia' });
  const thumbnail = detail.getByRole('img', { name: 'Print 1' });
  await expect(thumbnail).toHaveAttribute('src', /\/api\/admin\/reports\/.+\/attachments\//);
  await expect
    .poll(() =>
      thumbnail.evaluate((img) => (img as unknown as { naturalWidth: number }).naturalWidth),
    )
    .toBe(1400);
  await expect(
    detail.getByRole('link', { name: 'Abrir o print 1 em tamanho real' }),
  ).toHaveAttribute('target', '_blank');
  await admin.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
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

  test('Bia reports Caio at their table with a screenshot and the admin reviews it in Denúncias', async ({
    page: admin,
    newPlayerPage,
  }) => {
    const table = `Mesa da denúncia ${Date.now()}`;
    const { bia } = await seatBiaAndCaio(newPlayerPage, table);
    const details = `Spam no chat ${Date.now()}`;

    const card = await openCardFromRoster(bia, 'Caio');
    await card.getByRole('button', { name: 'Mais ações' }).click();
    await bia.getByRole('menuitem', { name: 'Denunciar' }).click();
    const report = bia.getByRole('dialog', { name: 'Denunciar Caio' });
    await report.getByRole('radio', { name: 'Spam' }).check();
    await report.getByLabel('Detalhes (opcional)').fill(details);
    await report.getByLabel('Mesa onde aconteceu (opcional)').selectOption({ label: table });
    await report.getByLabel('Anexar prints').setInputFiles(SCREENSHOT);
    await expect(report.getByRole('img', { name: 'Print 1' })).toBeVisible();
    await report.getByRole('button', { name: 'Enviar denúncia' }).click();
    await expect(report.getByText('Denúncia enviada.')).toBeVisible();

    await signIn(admin, adminCredentials());
    await admin.goto('/admin/reports');
    const row = admin.getByRole('table', { name: 'Denúncias abertas' }).getByRole('row', {
      name: new RegExp(details),
    });
    await expect(row).toContainText('@bia');
    await expect(row).toContainText('Spam');
    await expect(row).toContainText(table);
    await expect(row).toContainText('1 print');
    await reviewScreenshotOf(admin, row);
    await row.getByRole('button', { name: 'Aplicar medida' }).click();
    const measure = admin.getByRole('dialog', { name: 'Aplicar medida a @caio' });
    await expect(measure).toBeVisible();
    await measure.getByRole('button', { name: 'Cancelar' }).click();
    await row.getByRole('button', { name: 'Resolver' }).click();
    const resolve = admin.getByRole('dialog', { name: 'Resolver a denúncia' });
    await resolve.getByLabel(/Nota/).fill('Conversa lida; sem medida.');
    await resolve.getByRole('button', { name: 'Resolver' }).click();
    await expect(admin.getByText(details)).toHaveCount(0);
  });

  test('a Grátis or Narrador account shows no image banner on its card, nor sends one', async ({
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
      await closeCard(bia, free);

      // The banner is Lenda only: the Narrador neither shows the one kept nor sends a new one.
      await setPlanOf(admin, 'caio', 'narrador');
      const narrador = await openCardFromRoster(bia, 'Caio');
      await expect(narrador.getByTestId('profile-card-banner-image')).toHaveCount(0);
      const refused = await caio.request.put('/api/account/banner', {
        headers: { 'content-type': 'image/png' },
        data: await readFile(new URL('./fixtures/mapa-1400x700.png', import.meta.url)),
      });
      expect(refused.status()).toBe(403);
      expect((await refused.json()).planLimit).toMatchObject({
        resource: 'profileBanner',
        plan: 'narrador',
      });
    } finally {
      await setPlanOf(admin, 'caio', 'amigo_do_dono');
      await caio.request.delete('/api/account/banner');
    }
  });
});
