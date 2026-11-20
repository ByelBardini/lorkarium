import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { BIA } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';

const SCREENSHOT = fileURLToPath(new URL('./fixtures/mapa-1400x700.png', import.meta.url));

test.describe('feedback', () => {
  test('Bia sends a bug with a screenshot and the admin reviews it in Relatos, then archives it', async ({
    page: admin,
    newPlayerPage,
  }) => {
    const happened = `O token voltou ${Date.now()}`;
    const bia = await newPlayerPage();
    await signIn(bia, BIA);

    await bia.getByRole('navigation', { name: 'Principal' }).waitFor();
    await bia
      .getByRole('complementary', { name: 'Menu lateral' })
      .getByRole('button', { name: /Bia/ })
      .click();
    await bia.getByRole('menuitem', { name: 'Relatar bug ou sugerir' }).click();
    const form = bia.getByRole('dialog', { name: 'Relatar um bug ou sugerir' });
    await expect(form.getByRole('radio', { name: 'Navegador' })).toBeChecked();
    await expect(form.getByLabel('Navegador ou versão do app')).toHaveValue(/^Chrome \d+$/);
    await form.getByLabel('Passos para reproduzir').fill('Abri a mesa e arrastei o token');
    await form.getByLabel('O que você esperava').fill('O token andar');
    await form.getByLabel('O que aconteceu').fill(happened);
    await form.getByLabel('Anexar prints').setInputFiles(SCREENSHOT);
    await expect(form.getByRole('img', { name: 'Print 1' })).toBeVisible();
    await form.getByRole('button', { name: 'Enviar relato' }).click();
    await expect(form.getByRole('status')).toContainText('Recebemos seu relato.');

    await signIn(admin, adminCredentials());
    await admin.goto('/admin/relatos');
    const row = admin
      .getByRole('table', { name: 'Relatos esperando análise' })
      .getByRole('row', { name: new RegExp(happened) });
    await expect(row).toContainText('Bug');
    await expect(row).toContainText('@bia');
    await expect(row).toContainText('1 print');

    await row.getByRole('button', { name: 'Abrir' }).click();
    const detail = admin.getByRole('dialog', { name: 'Bug de @bia' });
    await expect(detail.getByRole('img', { name: 'Print 1' })).toHaveAttribute(
      'src',
      /\/api\/admin\/feedback\/.+\/attachments\//,
    );
    await admin.keyboard.press('Escape');

    // The e2e server runs without the GitHub App: the publish is refused and the entry stays.
    await row.getByRole('button', { name: 'Publicar no GitHub' }).click();
    const publish = admin.getByRole('dialog', { name: 'Publicar no GitHub' });
    await expect(publish.getByLabel('Título da issue')).toHaveValue(`[bug] ${happened}`);
    await publish.getByRole('button', { name: 'Publicar no GitHub' }).click();
    await expect(
      publish.getByText('A integração com o GitHub não está configurada no server.'),
    ).toBeVisible();
    await admin.keyboard.press('Escape');

    await row.getByRole('button', { name: 'Arquivar' }).click();
    const confirm = admin.getByRole('alertdialog', { name: 'Arquivar o relato de @bia?' });
    await confirm.getByRole('button', { name: 'Arquivar' }).click();
    await expect(row).toHaveCount(0);
  });
});
