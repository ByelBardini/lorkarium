import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';

const BADGE_IMAGE = fileURLToPath(new URL('./fixtures/token.png', import.meta.url));

async function createBadgeWithImage(admin: Page, name: string, description: string): Promise<void> {
  await admin.goto('/admin/badges');
  await admin.getByRole('button', { name: 'Nova insígnia' }).click();
  const sheet = admin.getByRole('dialog', { name: 'Nova insígnia' });
  await sheet.getByLabel('Nome').fill(name);
  await sheet.getByLabel('Descrição').fill(description);
  await sheet.getByLabel('Arquivo de imagem').setInputFiles(BADGE_IMAGE);
  const crop = admin.getByRole('dialog', { name: 'Recortar a insígnia' });
  await crop.getByRole('button', { name: 'Enviar' }).click();
  await expect(crop).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Criar' }).click();
  const row = admin.getByRole('table', { name: 'Insígnias' }).getByRole('row', { name });
  await expect(row.getByRole('img', { name })).toBeVisible();
}

async function grantBadgeToBia(admin: Page, badge: string): Promise<void> {
  await admin.goto('/admin/users');
  await admin.getByRole('button', { name: 'Ações de Bia' }).click();
  await admin.getByRole('menuitem', { name: 'Insígnias…' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Insígnias de @bia' });
  await dialog.getByRole('checkbox', { name: badge }).check();
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(admin.getByText('Insígnias de @bia salvas.')).toBeVisible();
}

async function deleteBadge(admin: Page, badge: string): Promise<void> {
  await admin.goto('/admin/badges');
  await admin.getByRole('button', { name: `Ações de ${badge}` }).click();
  await admin.getByRole('menuitem', { name: 'Excluir insígnia' }).click();
  const confirm = admin.getByRole('alertdialog', { name: `Excluir '${badge}'?` });
  await expect(confirm.getByText('1 conta perde essa insígnia.')).toBeVisible();
  await confirm.getByRole('button', { name: 'Excluir' }).click();
  await expect(admin.getByRole('row', { name: badge })).toHaveCount(0);
}

async function openCardOfBia(caio: Page): Promise<Locator> {
  await caio
    .getByRole('region', { name: 'Na mesa' })
    .getByRole('button', { name: 'Bia', exact: true })
    .first()
    .click();
  const card = caio.getByRole('dialog', { name: 'Perfil de Bia' });
  await expect(card.getByText('Rolagens')).toBeVisible();
  return card;
}

async function seatCaioWithBia(newPlayerPage: () => Promise<Page>): Promise<Page> {
  const table = `Mesa das insígnias ${Date.now()}`;
  const bia = await newPlayerPage();
  await signIn(bia, BIA);
  const code = await createTableAndReadCode(bia, table);
  await enterFromTheList(bia, table);
  const caio = await newPlayerPage();
  await signIn(caio, CAIO);
  await joinByCodeAndEnter(caio, code, bia);
  return caio;
}

test.describe('badges', () => {
  test('a granted badge shows on the card, and the full profile finds an @', async ({
    page: admin,
    newPlayerPage,
  }) => {
    test.setTimeout(120_000);
    const badge = `Veterano ${Date.now()}`;
    await signIn(admin, adminCredentials());
    await createBadgeWithImage(admin, badge, 'Jogou 100 sessões');
    await grantBadgeToBia(admin, badge);
    const caio = await seatCaioWithBia(newPlayerPage);

    try {
      const card = await openCardOfBia(caio);
      await card.getByRole('button', { name: `Insígnia ${badge}` }).hover();
      await expect(caio.getByRole('tooltip')).toContainText('Jogou 100 sessões');
      // Radix closes on a pointermove past the trigger's grace area, never on the leave alone.
      await caio.mouse.move(0, 0, { steps: 8 });
      await expect(caio.getByRole('tooltip')).toHaveCount(0);

      await card.getByRole('button', { name: 'Ver perfil completo' }).click();
      const full = caio.getByRole('dialog', { name: 'Perfil completo de Bia' });
      const search = full.getByRole('searchbox', { name: 'Buscar @usuário' });
      await search.fill('naoexiste');
      await search.press('Enter');
      await expect(full.getByRole('alert')).toHaveText(
        'O usuário "naoexiste" não foi encontrado no Lorkarium.',
      );
      await search.fill('caio');
      await search.press('Enter');
      await expect(caio.getByRole('dialog', { name: 'Perfil completo de Caio' })).toBeVisible();
      await caio.keyboard.press('Escape');
    } finally {
      await deleteBadge(admin, badge);
    }

    const after = await openCardOfBia(caio);
    await expect(after.getByRole('button', { name: `Insígnia ${badge}` })).toHaveCount(0);
  });
});
