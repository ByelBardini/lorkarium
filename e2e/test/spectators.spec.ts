import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { CAIO } from './support/dev-players';
import { adminCredentials, signIn } from './support/sign-in';
import { cardOf, openCard, statusOf } from './support/token-cards';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinAsSpectatorAndEnter,
  openRoomPeople,
  spectatorsOf,
} from './support/tables';

function spectatorBadgeOf(page: Page): Locator {
  return page
    .getByRole('region', { name: 'Topo da sala' })
    .getByText('Espectador', { exact: true });
}

function toolOf(page: Page, name: string): Locator {
  return page.getByRole('toolbar', { name: 'Ferramentas do tabuleiro' }).getByRole('button', {
    name,
  });
}

function playerCardNamed(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name: /^Jogadores · / })
    .getByTestId('nick-line')
    .filter({ hasText: name });
}

async function createLyraOfTheMaster(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Lyra');
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

// The detail of the table in a second tab of the master, so the room stays open in the first.
async function participantsOfTheDetail(admin: Page, name: string): Promise<string[]> {
  const campaignId = /\/campaigns\/([0-9a-f-]{36})\/table/.exec(admin.url())?.[1];
  if (!campaignId) throw new Error(`expected the room at /campaigns/<id>/table, at ${admin.url()}`);
  const detail = await admin.context().newPage();
  await detail.goto(`/campaigns/${campaignId}`);
  const participants = detail
    .getByRole('dialog', { name })
    .getByRole('list', { name: /^Participantes/ })
    .getByRole('listitem');
  await expect(participants.first()).toBeVisible();
  const names = await participants.allTextContents();
  await detail.close();
  return names;
}

test('the spectator only watches, is promoted and moved back live, and an F5 keeps him watching', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const name = `Mesa espectador ${Date.now()}`;
  const admin = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await enterFromTheList(admin, name);
  await createLyraOfTheMaster(admin);
  await openCard(admin, 'Lyra');
  await expect(cardOf(admin, 'Lyra')).toContainText('Coluna 11, linha 7');

  await signIn(caio, CAIO);
  await joinAsSpectatorAndEnter(caio, code);
  await expect(spectatorBadgeOf(caio)).toBeVisible();
  await expect(toolOf(caio, 'Selecionar (V)')).toBeVisible();
  await expect(toolOf(caio, 'Régua (R)')).toBeVisible();
  await expect(toolOf(caio, 'Desenhar (B)')).toHaveCount(0);
  await expect(toolOf(caio, 'Área de efeito (M)')).toHaveCount(0);

  await openRoomPeople(admin);
  await expect(spectatorsOf(admin)).toHaveAccessibleName('Espectadores · 1');
  await expect(spectatorsOf(admin)).toContainText('Caio');
  expect((await participantsOfTheDetail(admin, name)).join()).not.toContain('Caio');

  await openCard(caio, 'Lyra');
  await boardOf(caio).focus();
  await caio.keyboard.press('ArrowRight');
  // Nothing comes back to wait on: a refused move is never sent; the time a move would take.
  await caio.waitForTimeout(1_000);
  await expect(cardOf(caio, 'Lyra')).toContainText('Coluna 11, linha 7');
  await openCard(admin, 'Lyra');
  await expect(cardOf(admin, 'Lyra')).toContainText('Coluna 11, linha 7');

  await openRoomPeople(admin);
  await spectatorsOf(admin).getByRole('button', { name: 'Promover Caio a jogador' }).click();
  await expect(statusOf(caio)).toContainText('Agora você é jogador nesta mesa.');
  await expect(spectatorBadgeOf(caio)).toHaveCount(0);
  await expect(toolOf(caio, 'Desenhar (B)')).toBeVisible();
  await expect(playerCardNamed(admin, 'Caio')).toBeVisible();
  await expect(spectatorsOf(admin)).toHaveCount(0);

  await admin.getByRole('button', { name: 'Mais ações de Caio' }).click();
  await admin.getByRole('menuitem', { name: 'Mover para espectadores' }).click();
  const confirm = admin.getByRole('alertdialog', { name: 'Mover Caio para espectadores?' });
  await confirm.getByRole('button', { name: 'Mover', exact: true }).click();
  await expect(statusOf(caio)).toContainText('Agora você assiste a esta mesa.');
  await expect(spectatorBadgeOf(caio)).toBeVisible();
  await expect(toolOf(caio, 'Desenhar (B)')).toHaveCount(0);
  await expect(spectatorsOf(admin)).toContainText('Caio');

  await caio.reload();
  await expect(boardOf(caio)).toBeVisible();
  await expect(spectatorBadgeOf(caio)).toBeVisible();
  await expect(toolOf(caio, 'Desenhar (B)')).toHaveCount(0);
});
