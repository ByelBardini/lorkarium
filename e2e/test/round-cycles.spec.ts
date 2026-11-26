import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA, CAIO } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';
import {
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
  showRoomTab,
} from './support/tables';
import { chooseController } from './support/token-cards';

const MOON = ['Lua Nova', 'Crescente', 'Lua Cheia', 'Minguante'];

function badgeOf(page: Page): Locator {
  return page.getByRole('group', { name: 'Fases da Lua' });
}

function announcementOf(page: Page, round: number): Locator {
  return page.getByRole('status', { name: `Rodada ${round} começou` });
}

async function createToken(admin: Page, name: string, controller: string | null): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  if (controller) await chooseController(dialog, controller);
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

// Fases da Lua of the table: only Bia sees it and chooses, each phase announced to everyone.
async function createMoon(admin: Page): Promise<void> {
  await showRoomTab(admin, 'Ciclos');
  await admin.getByRole('button', { name: 'Novo ciclo' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo ciclo' });
  await dialog.getByLabel('Nome', { exact: true }).fill('Fases da Lua');
  await dialog.getByRole('button', { name: 'Adicionar fase' }).click();
  await dialog.getByRole('button', { name: 'Adicionar fase' }).click();
  for (const [index, phase] of MOON.entries()) {
    await dialog.getByLabel(`Nome da fase ${index + 1}`).fill(phase);
  }
  await dialog.getByLabel(/Só alguns jogadores/).click();
  const choosers = dialog.getByRole('group', { name: /Quem pode escolher/ });
  await choosers.getByLabel('Bia').click();
  await dialog.getByLabel(/Anunciar cada fase/).click();
  await dialog.getByRole('button', { name: 'Salvar ciclo' }).click();
  await expect(dialog).toBeHidden();
  await expect(admin.getByRole('region', { name: 'Ciclos da mesa' })).toContainText('Fases da Lua');
}

test('Lua da Bia: seen only by her, chosen by her, announced to everyone at the new round', async ({
  newPlayerPage,
}) => {
  test.setTimeout(150_000);
  const name = `Mesa ciclos ${Date.now()}`;
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
  await createMoon(admin);

  await showRoomTab(admin, 'Combate');
  await createToken(admin, 'Kael', 'Bia');
  await createToken(admin, 'Goblin', null);
  await admin.getByRole('button', { name: 'Iniciar combate' }).click();
  await admin.getByRole('textbox', { name: 'Iniciativa de Kael' }).fill('18');
  await admin.getByRole('textbox', { name: 'Iniciativa de Goblin' }).fill('10');
  await admin.getByRole('button', { name: 'Começar combate' }).click();

  // The start: everyone hears Lua Nova; only Bia (and the master) keep the badge.
  for (const page of [bia, caio]) await expect(announcementOf(page, 1)).toContainText('Lua Nova');
  await expect(badgeOf(bia)).toContainText('Lua Nova');
  await expect(badgeOf(admin)).toContainText('Lua Nova');
  await expect(badgeOf(caio)).toHaveCount(0);
  for (const page of [admin, bia, caio]) {
    await announcementOf(page, 1).getByRole('button', { name: 'Entendi' }).click();
  }

  // Bia picks Lua Cheia for the next round instead of Crescente.
  await badgeOf(bia).getByRole('button', { name: 'Próxima: Crescente' }).click();
  await bia
    .getByRole('dialog', { name: 'Fase da rodada 2' })
    .getByRole('button', { name: /Lua Cheia/ })
    .click();
  await expect(badgeOf(admin)).toContainText('Próxima · escolhida');

  await showRoomTab(bia, 'Combate');
  await bia.getByRole('button', { name: 'Passar a vez' }).click();
  await admin.getByRole('button', { name: 'Fechar rodada 1' }).click();

  for (const page of [bia, caio]) await expect(announcementOf(page, 2)).toContainText('Lua Cheia');
  await expect(badgeOf(bia)).toContainText('Fases da Lua · rodada 2');
  await expect(badgeOf(bia)).toContainText('Lua Cheia');
  await expect(badgeOf(caio)).toHaveCount(0);
  await expect(caio.getByRole('tab', { name: 'Ciclos' })).toHaveCount(0);
});
