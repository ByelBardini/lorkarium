import { expect, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { signIn } from './support/sign-in';

const TABLE = 'Mesa da Bia para amigos';

async function openFriends(page: Page): Promise<void> {
  await page.goto('/friends');
  await expect(page.getByRole('heading', { name: 'Amigos', level: 1 })).toBeVisible();
}

function friendRowOf(page: Page, name: string): Locator {
  return page.getByRole('link', { name: new RegExp(`^Conversar com ${name}, `) });
}

async function chooseStatus(
  page: Page,
  name: string,
  status: 'Online' | 'Invisível',
): Promise<void> {
  await page.getByRole('button', { name, exact: true }).click();
  await page.getByRole('menuitemradio', { name: status }).click();
  await page.keyboard.press('Escape');
}

// Created public through the route (settings change only with the table open): Explorar must
// list it to Caio before the block, so its absence afterwards proves the block.
async function createPublicTable(owner: Page, name: string): Promise<string> {
  const created = await owner.request.post('/api/campaigns', {
    data: { name, visibility: 'public' },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { campaign } = (await created.json()) as { campaign: { joinCode: string | null } };
  if (!campaign.joinCode) throw new Error(`expected a joinCode for ${name}, got null`);
  return campaign.joinCode;
}

async function searchPublic(page: Page, name: string): Promise<Locator> {
  await page.goto('/campaigns/public');
  await page.getByRole('searchbox', { name: 'Buscar mesa pública' }).fill(name);
  await page.getByRole('button', { name: 'Pesquisar' }).click();
  return page.getByRole('main').getByText(name, { exact: true });
}

async function tryJoinByCode(page: Page, code: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entrar com código' }).first().click();
  const join = page.getByRole('dialog', { name: 'Entrar numa mesa' });
  await join.getByLabel('Código da mesa').fill(code);
  await join.getByRole('button', { name: 'Entrar', exact: true }).click();
}

test('friendship end to end: request, accept, presence, conversation, invisible and block', async ({
  newPlayerPage,
}) => {
  test.setTimeout(150_000);
  const bia = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(bia, BIA);
  await signIn(caio, CAIO);
  const code = await createPublicTable(bia, TABLE);
  await expect(await searchPublic(caio, TABLE)).toBeVisible();

  await openFriends(bia);
  await bia.getByRole('button', { name: 'Adicionar' }).click();
  await bia.getByLabel('Adicionar pelo @usuário').fill('@caio');
  await bia.getByRole('button', { name: 'Enviar' }).click();
  await expect(
    bia.getByRole('status').filter({ hasText: 'Pedido enviado pra @caio.' }),
  ).toBeVisible();

  await openFriends(caio);
  await caio.getByRole('tab', { name: 'Pedidos (1)' }).click();
  await caio
    .getByRole('listitem', { name: 'Bia' })
    .getByRole('button', { name: 'Aceitar' })
    .click();
  await caio.getByRole('tab', { name: 'Todos' }).click();
  await expect(friendRowOf(caio, 'Bia')).toHaveAccessibleName('Conversar com Bia, online');
  await expect(friendRowOf(bia, 'Caio')).toHaveAccessibleName('Conversar com Caio, online');

  await friendRowOf(bia, 'Caio').click();
  await friendRowOf(caio, 'Bia').click();
  await caio.getByLabel('Mensagem para Bia').pressSequentially('Oi');
  await expect(bia.getByText('Caio está digitando…')).toBeVisible();
  await caio.getByLabel('Mensagem para Bia').press('Enter');
  await expect(bia.getByRole('region', { name: 'Conversa' })).toContainText('Oi');
  await bia.getByLabel('Mensagem para Caio').fill('Bora jogar hoje?');
  await bia.getByLabel('Mensagem para Caio').press('Enter');
  await expect(caio.getByRole('region', { name: 'Conversa' })).toContainText('Bora jogar hoje?');

  await chooseStatus(caio, 'Caio', 'Invisível');
  await expect(friendRowOf(bia, 'Caio')).toHaveAccessibleName('Conversar com Caio, offline');
  await expect(bia.getByLabel('Mensagem para Caio')).toBeDisabled();
  await expect(
    bia.getByText('Caio está offline. Mensagens só chegam a quem está online.'),
  ).toBeVisible();
  await chooseStatus(caio, 'Caio', 'Online');
  await expect(friendRowOf(bia, 'Caio')).toHaveAccessibleName('Conversar com Caio, online');

  await bia.getByRole('button', { name: 'Opções de Caio' }).click();
  await bia.getByRole('menuitem', { name: 'Bloquear' }).click();
  await bia
    .getByRole('alertdialog', { name: 'Bloquear Caio?' })
    .getByRole('button', { name: 'Bloquear' })
    .click();
  await expect(friendRowOf(bia, 'Caio')).toHaveCount(0);

  await tryJoinByCode(caio, code);
  await expect(caio.getByText('Nenhuma mesa com esse código.')).toBeVisible();
  await expect(await searchPublic(caio, TABLE)).toHaveCount(0);
});
