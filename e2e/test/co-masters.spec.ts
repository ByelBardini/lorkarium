import { expect, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinAsSpectatorAndEnter,
  openRoomPeople,
  spectatorsOf,
} from './support/tables';
import { cardOf, openCard, statusOf } from './support/token-cards';

function toolOf(page: Page, name: string): Locator {
  return page.getByRole('toolbar', { name: 'Ferramentas do tabuleiro' }).getByRole('button', {
    name,
  });
}

function peopleSection(page: Page, name: RegExp): Locator {
  return page.getByRole('region', { name: 'Na mesa' }).getByRole('region', { name });
}

function wolfRowOf(page: Page): Locator {
  return page.getByRole('list', { name: 'Na cena' }).getByRole('button', { name: /^Lobo/ });
}

async function expectWolfInScene(page: Page, count: 0 | 1): Promise<void> {
  await page.getByRole('tab', { name: 'Combate' }).click();
  await expect(wolfRowOf(page)).toHaveCount(count);
}

// A token nobody controls, then the switch on its card: only the masters keep it.
async function createHiddenWolf(owner: Page): Promise<void> {
  await owner.getByRole('button', { name: 'Novo token' }).click();
  const dialog = owner.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lobo');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
  await openCard(owner, 'Lobo');
  const hidden = cardOf(owner, 'Lobo').getByRole('button', { name: 'Invisível para os jogadores' });
  await hidden.click();
  await expect(hidden).toHaveAttribute('aria-pressed', 'true');
}

async function chooseRoleAction(page: Page, person: string, item: string): Promise<void> {
  await page.getByRole('button', { name: `Mais ações de ${person}` }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function enterAsJuggernaut(admin: Page, name: string): Promise<void> {
  await admin.goto('/campaigns/public');
  await admin.getByRole('searchbox', { name: 'Buscar mesa pública' }).fill(name);
  await admin.getByRole('button', { name: 'Pesquisar' }).click();
  await admin.getByRole('button', { name: `Entrar como juggernaut em ${name}` }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Entrar na mesa' }).click();
  await openRoomPeople(admin);
}

async function leaveJuggernautMode(admin: Page): Promise<void> {
  await admin
    .getByRole('region', { name: 'Topo da sala' })
    .getByRole('button', { name: 'Mais ações da mesa' })
    .click();
  await admin.getByRole('menuitem', { name: 'Sair do modo juggernaut' }).click();
  await expect(admin).toHaveURL(/\/campaigns\/public$/);
}

test('the owner makes a spectator master and back to player live, and an admin enters and leaves as juggernaut', async ({
  newPlayerPage,
}) => {
  // Three pages drawing PixiJS without a GPU, like token-hidden.spec.
  test.setTimeout(240_000);
  const name = `Mesa co-mestre ${Date.now()}`;
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  const admin = await newPlayerPage();
  await signIn(bia, BIA);
  const code = await createTableAndReadCode(bia, name);
  await enterFromTheList(bia, name);
  await createHiddenWolf(bia);

  await signIn(caio, CAIO);
  await joinAsSpectatorAndEnter(caio, code);
  await expect(toolOf(caio, 'Paredes (P)')).toHaveCount(0);
  await openRoomPeople(bia);
  await expect(spectatorsOf(bia)).toContainText('Caio');

  // Straight from spectator to master, with the question first.
  await chooseRoleAction(bia, 'Caio', 'Tornar mestre');
  const confirm = bia.getByRole('alertdialog', { name: 'Tornar Caio mestre?' });
  await confirm.getByRole('button', { name: 'Tornar mestre' }).click();
  await expect(statusOf(caio)).toContainText('Agora você é mestre desta mesa.');
  await expect(toolOf(caio, 'Paredes (P)')).toBeVisible();
  await expect(toolOf(caio, 'Luzes (L)')).toBeVisible();
  await expectWolfInScene(caio, 1);
  await openRoomPeople(bia);
  await expect(peopleSection(bia, /^Mestres?$/)).toContainText('Caio');

  await chooseRoleAction(bia, 'Caio', 'Mover para jogadores');
  await expect(statusOf(caio)).toContainText('Agora você é jogador nesta mesa.');
  await expect(toolOf(caio, 'Paredes (P)')).toHaveCount(0);
  await expectWolfInScene(caio, 0);

  // The admin is no member of Bia's private table: Explorar lists it for them anyway.
  await signIn(admin, adminCredentials());
  await enterAsJuggernaut(admin, name);
  await expect(boardOf(admin)).toBeVisible();
  await expectWolfInScene(admin, 1);
  await openRoomPeople(bia);
  await expect(peopleSection(bia, /^Juggernauts?$/)).toBeVisible();

  await leaveJuggernautMode(admin);
  await expect(peopleSection(bia, /^Juggernauts?$/)).toHaveCount(0);
  await admin.goto('/');
  await expect(admin.getByRole('navigation', { name: 'Principal' })).toBeVisible();
  await expect(admin.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
});
