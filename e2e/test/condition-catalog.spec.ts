import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA, CAIO } from './support/dev-players';
import { cellCenterOf } from './support/board-cells';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinAsSpectatorAndEnter,
  joinByCodeAndEnter,
} from './support/tables';
import { createTokenFor, statusOf } from './support/token-cards';

// A new token lands at the middle of the default scene; the Goblin is walked 3 cells right.
const KAEL_CELL = [10, 6] as const;
const GOBLIN_CELL = [13, 6] as const;
const SANGRANDO = 'Perde 1d4 PV por turno.';

async function openConditionsPage(master: Page): Promise<void> {
  await master.getByRole('link', { name: 'Condições', exact: true }).click();
  await expect(master).toHaveURL((url) => url.pathname.endsWith('/table/conditions'));
  await expect(master.getByRole('heading', { level: 1, name: 'Condições da mesa' })).toBeVisible();
}

async function backToTable(master: Page): Promise<void> {
  await master.getByRole('link', { name: 'Voltar à mesa' }).click();
  await expect(master).toHaveURL((url) => url.pathname.endsWith('/table'));
}

function sheetOf(page: Page, title: string): Locator {
  return page.getByRole('dialog', { name: title });
}

async function describeEnvenenado(master: Page): Promise<void> {
  await master.getByRole('button', { name: 'Editar Envenenado' }).click();
  const sheet = sheetOf(master, 'Editar Envenenado');
  await sheet.getByLabel('Descrição').fill('Desvantagem em ataques.');
  await sheet.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(sheet.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Fechar' }).click();
  await expect(master.getByRole('button', { name: 'Editar Envenenado' })).toContainText(
    'Desvantagem em ataques.',
  );
}

// Sangrando piles up to 3 stacks.
async function createSangrando(master: Page): Promise<void> {
  await master.getByRole('button', { name: 'Nova condição' }).click();
  const sheet = sheetOf(master, 'Nova condição');
  await sheet.getByLabel('Nome').fill('Sangrando');
  await sheet.getByLabel('Descrição').fill(SANGRANDO);
  await sheet.getByRole('switch', { name: 'Acumula (stacks)' }).click();
  await sheet.getByLabel('Máximo de stacks', { exact: true }).fill('3');
  await sheet.getByRole('button', { name: 'Criar condição' }).click();
  await expect(sheetOf(master, 'Editar Sangrando')).toBeVisible();
  await sheetOf(master, 'Editar Sangrando').getByRole('button', { name: 'Fechar' }).click();
  await expect(master.getByRole('button', { name: 'Editar Sangrando' })).toContainText(
    'Acumula até ×3',
  );
}

// Admin's keyboard: the only token on the board is picked by "]" and walked right.
async function walkGoblinRight(admin: Page): Promise<void> {
  await boardOf(admin).focus();
  await admin.keyboard.press(']');
  // Each step waits for its confirmation: a key pressed while the move is in flight is dropped.
  for (const column of [12, 13, 14]) {
    await admin.keyboard.press('ArrowRight');
    await expect(statusOf(admin)).toContainText(`Goblin foi para a coluna ${column}, linha 7`);
  }
  await admin.keyboard.press('Escape');
}

async function pickInTool(page: Page, condition: string, rounds: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Condição (C)' }).click();
  const panel = page.getByRole('region', { name: 'Aplicar condição' });
  await panel.getByRole('option', { name: condition }).click();
  await panel.getByLabel('Rodadas').fill(rounds);
  return panel;
}

async function clickCell(
  page: Page,
  cell: readonly [number, number],
  shift = false,
): Promise<void> {
  const at = await cellCenterOf(page, ...cell);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  if (shift) await page.keyboard.up('Shift');
}

async function hover(page: Page, cell: readonly [number, number]): Promise<Locator> {
  const at = await cellCenterOf(page, ...cell);
  await page.mouse.move(at.x - 20, at.y - 20);
  await page.mouse.move(at.x, at.y, { steps: 5 });
  return page.getByRole('tooltip');
}

function conditionsOn(card: Locator, token: string): Locator {
  return card.getByRole('list', { name: `Condições de ${token}` });
}

test('the master keeps the list on its own page, a player stacks conditions on any token with the tool, and everyone follows', async ({
  newPlayerPage,
}) => {
  test.setTimeout(240_000);
  const name = `Mesa condições config ${Date.now()}`;
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

  await createTokenFor(admin, 'Goblin', 'Caio');
  await walkGoblinRight(admin);
  await createTokenFor(admin, 'Kael', 'Caio');

  await openConditionsPage(admin);
  await describeEnvenenado(admin);
  await createSangrando(admin);
  await backToTable(admin);

  // Bia controls neither token and still stamps both; the hint says a click adds a stack.
  const panel = await pickInTool(bia, 'Sangrando', '3');
  await expect(panel.getByRole('option', { name: 'Sangrando' })).toContainText(SANGRANDO);
  await expect(statusOf(bia)).toContainText(
    'Clique soma 1 stack de Sangrando (3 rodadas); Shift+clique tira 1.',
  );
  await clickCell(bia, GOBLIN_CELL);
  await expect(conditionsOn(await hover(caio, GOBLIN_CELL), 'Goblin')).toContainText('×1');
  await clickCell(bia, GOBLIN_CELL);
  await expect(conditionsOn(await hover(caio, GOBLIN_CELL), 'Goblin')).toContainText('×2');
  await clickCell(bia, KAEL_CELL);
  await expect(conditionsOn(await hover(caio, KAEL_CELL), 'Kael')).toContainText('Sangrando');

  // Shift+click takes one stack off, then the last one takes the condition off, for everyone.
  await clickCell(bia, GOBLIN_CELL, true);
  await expect(conditionsOn(await hover(caio, GOBLIN_CELL), 'Goblin')).toContainText('×1');
  await clickCell(bia, GOBLIN_CELL, true);
  // Without conditions the card says so instead of drawing an empty list.
  await expect(await hover(caio, GOBLIN_CELL)).toContainText('Nenhuma condição.');

  // F5 keeps the Kael's.
  await bia.reload();
  await expect(conditionsOn(await hover(bia, KAEL_CELL), 'Kael')).toContainText('Sangrando');

  // Deleting it tells how many tokens hold it, then it leaves the Kael for everyone.
  await openConditionsPage(admin);
  await admin.getByRole('button', { name: 'Editar Sangrando' }).click();
  await sheetOf(admin, 'Editar Sangrando')
    .getByRole('button', { name: 'Excluir Sangrando' })
    .click();
  const confirm = admin.getByRole('alertdialog', { name: 'Excluir Sangrando?' });
  await expect(confirm).toContainText('Está em 1 token.');
  await confirm.getByRole('button', { name: 'Excluir' }).click();
  await expect(admin.getByRole('button', { name: 'Editar Sangrando' })).toBeHidden();
  await expect(await hover(caio, KAEL_CELL)).toContainText('Nenhuma condição.');

  // A deleted default comes back with "Restaurar padrões".
  await admin.getByRole('button', { name: 'Editar Cego' }).click();
  await sheetOf(admin, 'Editar Cego').getByRole('button', { name: 'Excluir Cego' }).click();
  await admin
    .getByRole('alertdialog', { name: 'Excluir Cego?' })
    .getByRole('button', { name: 'Excluir' })
    .click();
  await expect(admin.getByRole('button', { name: 'Editar Cego' })).toBeHidden();
  await admin.getByRole('button', { name: 'Restaurar padrões' }).click();
  await expect(admin.getByRole('button', { name: 'Editar Cego' })).toBeVisible();
});

test('a spectator has no condition tool and no way to the list', async ({ newPlayerPage }) => {
  test.setTimeout(90_000);
  const admin = await newPlayerPage();
  const watcher = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, `Mesa condições espectador ${Date.now()}`);
  await signIn(watcher, BIA);
  await joinAsSpectatorAndEnter(watcher, code);

  await expect(watcher.getByRole('button', { name: 'Selecionar (V)' })).toBeVisible();
  await expect(watcher.getByRole('button', { name: 'Condição (C)' })).toHaveCount(0);
  await expect(watcher.getByRole('link', { name: 'Condições', exact: true })).toHaveCount(0);
});
