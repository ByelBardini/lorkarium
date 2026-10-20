import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA, CAIO } from './support/dev-players';
import { cellCenterOf } from './support/board-cells';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { chooseController, statusOf } from './support/token-cards';

function order(page: Page): Locator {
  return page.getByRole('list', { name: 'Ordem de iniciativa' }).getByRole('listitem');
}

// The row's button is named after the token, then its conditions ("Lyra 1 condição: Atordoado").
function rowOf(page: Page, name: string): Locator {
  return order(page).getByRole('button', { name: new RegExp(`^${name}`) });
}

// Only the entries: the tokens of a group are list items nested inside them.
function entries(page: Page): Locator {
  return page.getByRole('list', { name: 'Ordem de iniciativa' }).locator(':scope > li');
}

function tokensOf(page: Page, entry: string): Locator {
  return page.getByRole('list', { name: `Tokens de ${entry}` }).getByRole('listitem');
}

async function choose(page: Page, menu: string, item: string): Promise<void> {
  await page.getByRole('button', { name: menu }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

// Picks the token in the tracker, then hands the keys to the board.
async function deleteFromTheBoard(admin: Page, token: Locator, question: string): Promise<void> {
  // The row toggles: clicking a token already picked would drop it from the selection.
  if ((await token.getAttribute('aria-expanded')) !== 'true') await token.click();
  await admin.getByRole('application').focus();
  await admin.keyboard.press('Delete');
  const dialog = admin.getByRole('alertdialog', { name: question });
  await dialog.getByRole('button', { name: 'Excluir' }).click();
  await expect(dialog).toBeHidden();
}

function turnLine(page: Page): Locator {
  return page.getByRole('region', { name: 'Topo da sala' }).getByLabel('Rodada e vez');
}

async function showCombat(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Combate' }).click();
}

async function createToken(
  admin: Page,
  name: string,
  controller: string | null,
  side: 'Aliado' | 'Inimigo' = 'Aliado',
): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill(name);
  await dialog.getByRole('radio', { name: side }).check();
  if (controller) await chooseController(dialog, controller);
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

async function setInitiative(page: Page, name: string, value: string): Promise<void> {
  const field = page.getByLabel(`Iniciativa de ${name}`);
  await field.fill(value);
  await field.press('Enter');
}

test('a whole combat: order, turns, rounds, a condition that expires, passing the turn, a tie and an F5', async ({
  newPlayerPage,
}) => {
  test.setTimeout(120_000);
  const name = `Mesa combate ${Date.now()}`;
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
    await joinByCodeAndEnter(page, code);
    await showCombat(page);
  }
  await enterFromTheList(admin, name);
  await showCombat(admin);

  await createToken(admin, 'Kael', 'Bia');
  await createToken(admin, 'Lyra', 'Caio');
  await createToken(admin, 'Goblin', null);
  await admin.getByRole('button', { name: 'Iniciar combate' }).click();
  await admin
    .getByRole('dialog', { name: 'Iniciar combate' })
    .getByRole('button', { name: 'Iniciar' })
    .click();

  await setInitiative(admin, 'Kael', '18');
  await setInitiative(admin, 'Lyra', '14');
  await setInitiative(admin, 'Goblin', '-2');
  for (const page of [admin, bia, caio]) {
    await expect(order(page)).toHaveText([/Kael/, /Lyra/, /Goblin/]);
  }

  await rowOf(admin, 'Lyra').click();
  await admin.getByRole('combobox', { name: 'Adicionar condição' }).fill('Atordoado');
  await admin.getByLabel('Rodadas').fill('1');
  await admin.getByRole('button', { name: 'Aplicar' }).click();
  await expect(order(caio).filter({ hasText: 'Lyra' })).toContainText('Atordoado');
  // Closed again: the open card lists every condition of the table in its suggestions.
  await rowOf(admin, 'Lyra').click();

  await expect(caio.getByRole('button', { name: 'Passar a vez' })).toHaveCount(0);
  await bia.getByRole('button', { name: 'Passar a vez' }).click();
  await expect(turnLine(caio)).toHaveText('Rodada 1 · Vez de Lyra');

  // Applied in round 1: the end of Lyra's round-1 turn does not count it (it goes in round 2).
  await caio.getByRole('button', { name: 'Passar a vez' }).click();
  await expect(turnLine(caio)).toHaveText('Rodada 1 · Vez de Goblin');
  for (const page of [admin, bia, caio]) {
    await expect(order(page).filter({ hasText: 'Lyra' })).toContainText('Atordoado');
  }

  await admin.getByRole('button', { name: 'Próximo turno' }).click();
  for (const page of [admin, bia, caio]) {
    await expect(turnLine(page)).toHaveText('Rodada 2 · Vez de Kael');
  }

  await setInitiative(caio, 'Lyra', '18');
  await admin.getByRole('button', { name: 'Subir Lyra no empate' }).click();
  await expect(order(bia)).toHaveText([/Lyra/, /Kael/, /Goblin/]);

  await bia.reload();
  await showCombat(bia);
  await expect(turnLine(bia)).toHaveText('Rodada 2 · Vez de Kael');
  await expect(order(bia)).toHaveText([/Lyra/, /Kael/, /Goblin/]);

  await admin.getByRole('button', { name: 'Encerrar combate' }).click();
  await admin.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await expect(bia.getByText('Fora de combate')).toBeVisible();
});

test('grouped initiative: enemies together, the boss alone, a paste that joins, a split, Delete, a lair and a rename', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const name = `Mesa grupos ${Date.now()}`;
  const admin = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(caio, CAIO);
  await joinByCodeAndEnter(caio, code);
  await showCombat(caio);
  await enterFromTheList(admin, name);
  await showCombat(admin);

  await createToken(admin, 'Kael', 'Caio');
  for (const enemy of ['Goblin', 'Goblin 2', 'Gigante']) {
    await createToken(admin, enemy, null, 'Inimigo');
  }
  await admin.keyboard.press('2');
  await createToken(admin, 'Baú', null);
  await admin.keyboard.press('1');

  // The chest is on Objetos: it does not enter. The Gigante keeps an initiative of its own.
  await admin.getByRole('button', { name: 'Iniciar combate' }).click();
  const start = admin.getByRole('dialog', { name: 'Iniciar combate' });
  await expect(start.getByRole('checkbox', { name: 'Baú' })).toHaveCount(0);
  await start.getByRole('checkbox', { name: 'Iniciativa própria de Gigante' }).click();
  await start.getByRole('button', { name: 'Iniciar' }).click();
  await expect(entries(caio)).toHaveText([/Kael/, /Inimigos/, /Gigante/]);
  await expect(tokensOf(caio, 'Inimigos')).toHaveText([/^Goblin$/, /^Goblin 2$/]);

  // The turn of the group: one line, one announcement; "Próximo turno" goes on to the Gigante.
  await admin.getByRole('button', { name: 'Próximo turno' }).click();
  await expect(entries(caio).nth(1)).toHaveAttribute('aria-current', 'true');
  await expect(statusOf(caio)).toHaveText('Vez de Inimigos.');
  await admin.getByRole('button', { name: 'Próximo turno' }).click();
  await expect(turnLine(caio)).toHaveText('Rodada 1 · Vez de Gigante');

  // A copy of the Goblin pasted on another cell joins Inimigos.
  await tokensOf(admin, 'Inimigos').getByRole('button', { name: 'Goblin', exact: true }).click();
  await admin.keyboard.press('Control+c');
  await expect(statusOf(admin)).toHaveText('1 item copiado.');
  const target = await cellCenterOf(admin, 14, 3);
  await admin.mouse.move(target.x, target.y);
  await admin.keyboard.press('Control+v');
  await expect(tokensOf(caio, 'Inimigos')).toHaveCount(3);

  // "Separar" gives the Goblin 2 an entry of its own, at the end and without initiative.
  await choose(admin, 'Mais ações de Goblin 2', 'Separar');
  await expect(entries(caio).last()).toHaveText(/^—\s*Goblin 2/);

  // Delete asks first; deleting the last goblins of Inimigos takes the entry out.
  const goblins = tokensOf(admin, 'Inimigos').getByRole('button', { name: 'Goblin', exact: true });
  await deleteFromTheBoard(admin, goblins.first(), 'Excluir Goblin?');
  await expect(tokensOf(caio, 'Inimigos')).toHaveCount(1);
  await deleteFromTheBoard(admin, goblins.first(), 'Excluir Goblin?');
  await expect(entries(caio)).toHaveText([/Kael/, /Gigante/, /Goblin 2/]);

  await admin.getByRole('button', { name: 'Entrada sem token' }).click();
  await admin.getByLabel('Nome da entrada').fill('Covil');
  await admin.getByRole('button', { name: 'Criar entrada' }).click();
  await expect(entries(caio).last()).toHaveText(/Covil/);

  await choose(admin, 'Mais ações de Gigante', 'Renomear');
  const rename = admin.getByLabel('Nome de Gigante');
  await rename.fill('Chefe');
  await rename.press('Enter');
  await expect(entries(caio).nth(1)).toHaveText(/^—?\s*Chefe/);
});
