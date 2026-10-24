import { expect, type Locator, type Page } from '@playwright/test';
import { test } from './support/player-pages';
import { BIA, CAIO } from './support/dev-players';
import { cellCenterOf } from './support/board-cells';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { chooseController, statusOf } from './support/token-cards';

// Only the entries: the tokens of a group are list items nested inside them.
function entries(page: Page): Locator {
  return page.getByRole('list', { name: 'Ordem de iniciativa' }).locator(':scope > li');
}

// The line of a token in the tracker is named after it, then who plays it and its bar.
function rowOf(page: Page, name: string): Locator {
  return page
    .getByRole('list', { name: 'Ordem de iniciativa' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
}

function tokensOf(page: Page, entry: string): Locator {
  return page.getByRole('list', { name: `Tokens de ${entry}` }).getByRole('listitem');
}

function dockOf(page: Page): Locator {
  return page.getByRole('region', { name: 'Token selecionado' });
}

function recapOf(page: Page): Locator {
  return page.getByRole('status', { name: 'O que aconteceu' });
}

function turnLine(page: Page): Locator {
  return page.getByRole('region', { name: 'Topo da sala' }).getByLabel('Rodada e vez');
}

async function choose(page: Page, menu: string, item: string): Promise<void> {
  await page.getByRole('button', { name: menu }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

// Picks the token in the tracker, then hands the keys to the board.
async function deleteFromTheBoard(admin: Page, token: Locator, question: string): Promise<void> {
  // The line toggles: clicking a token already picked would drop it from the selection.
  if ((await token.getAttribute('aria-pressed')) !== 'true') await token.click();
  await admin.getByRole('application').focus();
  await admin.keyboard.press('Delete');
  const dialog = admin.getByRole('alertdialog', { name: question });
  await dialog.getByRole('button', { name: 'Excluir' }).click();
  await expect(dialog).toBeHidden();
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

async function typeInitiative(page: Page, name: string, value: string): Promise<void> {
  await page.getByRole('textbox', { name: `Iniciativa de ${name}` }).fill(value);
}

async function setInitiative(page: Page, name: string, value: string): Promise<void> {
  const field = page
    .getByRole('list', { name: 'Ordem de iniciativa' })
    .getByLabel(`Iniciativa de ${name}`);
  await field.fill(value);
  await field.press('Enter');
}

test('a whole combat: the preparation with initiative, turns, rounds, a condition counted down, passing the turn and an F5', async ({
  newPlayerPage,
}) => {
  test.setTimeout(150_000);
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
    await joinByCodeAndEnter(page, code, admin);
    await showCombat(page);
  }
  await enterFromTheList(admin, name);
  await showCombat(admin);

  await createToken(admin, 'Kael', 'Bia');
  await createToken(admin, 'Lyra', 'Caio');
  await createToken(admin, 'Goblin', null, 'Inimigo');
  await expect(admin.getByText('3 tokens na cena')).toBeVisible();

  // The preparation in the panel: Kael 18, Goblin −2, Lyra left blank (at the end, with "—").
  await admin.getByRole('button', { name: 'Iniciar combate' }).click();
  await expect(admin.getByRole('heading', { name: 'Quem entra na briga?' })).toBeVisible();
  await typeInitiative(admin, 'Kael', '18');
  await typeInitiative(admin, 'Goblin', '-2');
  await expect(admin.getByText('Lyra começa sem iniciativa')).toBeVisible();
  await admin.getByRole('button', { name: 'Começar combate' }).click();
  for (const page of [admin, bia, caio]) {
    await expect(entries(page)).toHaveText([/Kael/, /Goblin/, /Lyra/]);
    await expect(turnLine(page)).toHaveText('Rodada 1 · Vez de Kael');
  }
  // Bia only reads Lyra's initiative: the box says "—".
  await expect(entries(bia).nth(2)).toContainText('—');

  // Caio fills in the initiative of his Lyra.
  await setInitiative(caio, 'Lyra', '14');
  await expect(entries(bia)).toHaveText([/Kael/, /Lyra/, /Goblin/]);

  // A condition from the detail at the foot of the panel; "+" reaches the others.
  await rowOf(admin, 'Lyra').click();
  const dock = dockOf(admin);
  await dock.getByRole('combobox', { name: 'Adicionar condição' }).fill('Atordoado');
  await dock.getByLabel('Rodadas').fill('1');
  await dock.getByRole('button', { name: 'Aplicar' }).click();
  await dock.getByRole('button', { name: 'Mais uma rodada de Atordoado' }).click();
  await expect(caio.getByRole('list', { name: 'Condições de Lyra' })).toContainText('Atordoado2');
  await dock.getByRole('button', { name: 'Menos uma rodada de Atordoado' }).click();
  await expect(caio.getByRole('list', { name: 'Condições de Lyra' })).toContainText('Atordoado1');
  await dock.getByRole('button', { name: 'Fechar ficha' }).click();

  await expect(caio.getByRole('button', { name: 'Passar a vez' })).toHaveCount(0);
  await bia.getByRole('button', { name: 'Passar a vez' }).click();
  await expect(turnLine(caio)).toHaveText('Rodada 1 · Vez de Lyra');
  // The turn opens Lyra's detail for Caio, who runs it.
  await expect(dockOf(caio).getByRole('heading', { name: 'Lyra' })).toBeVisible();

  // Applied in round 1: the end of Lyra's round-1 turn does not count it.
  await caio.getByRole('button', { name: 'Passar a vez' }).click();
  await expect(turnLine(caio)).toHaveText('Rodada 1 · Vez de Goblin');
  await expect(caio.getByRole('list', { name: 'Condições de Lyra' })).toContainText('Atordoado');

  await admin.getByRole('button', { name: 'Fechar rodada 1' }).click();
  for (const page of [admin, bia, caio]) {
    await expect(turnLine(page)).toHaveText('Rodada 2 · Vez de Kael');
    await expect(recapOf(page)).toContainText('Rodada 2 começou.');
  }

  await bia.getByRole('button', { name: 'Passar a vez' }).click();
  await caio.getByRole('button', { name: 'Passar a vez' }).click();
  await expect(recapOf(admin)).toContainText('Atordoado acabou em Lyra.');

  await bia.reload();
  await showCombat(bia);
  await expect(turnLine(bia)).toHaveText('Rodada 2 · Vez de Goblin');
  await expect(entries(bia)).toHaveText([/Kael/, /Lyra/, /Goblin/]);

  await choose(admin, 'Mais opções do combate', 'Encerrar combate');
  const confirm = admin.getByRole('alertdialog', { name: 'Encerrar o combate?' });
  await confirm.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await expect(bia.getByText('Fora de combate')).toBeVisible();
  await expect(recapOf(admin)).toContainText('Combate encerrado depois de 2 rodadas.');
});

test('grouped initiative: the same creature together, adding mid-fight, a paste that joins, a split, Delete, a lair and a rename', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const name = `Mesa grupos ${Date.now()}`;
  const admin = await newPlayerPage();
  const caio = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(caio, CAIO);
  await joinByCodeAndEnter(caio, code, admin);
  await showCombat(caio);
  await enterFromTheList(admin, name);
  await showCombat(admin);

  await createToken(admin, 'Kael', 'Caio');
  for (const enemy of ['Bandido 1', 'Bandido 2', 'Gigante']) {
    await createToken(admin, enemy, null, 'Inimigo');
  }
  await admin.keyboard.press('2');
  await createToken(admin, 'Baú', null);
  await admin.keyboard.press('1');

  // The chest is on Objetos: it does not enter. The bandits act together with 15.
  await admin.getByRole('button', { name: 'Iniciar combate' }).click();
  await expect(admin.getByRole('checkbox', { name: 'Incluir Baú' })).toHaveCount(0);
  await typeInitiative(admin, 'Bandido', '15');
  await typeInitiative(admin, 'Kael', '12');
  await typeInitiative(admin, 'Gigante', '10');
  await expect(admin.getByText('3 na ordem')).toBeVisible();
  await admin.getByRole('button', { name: 'Começar combate' }).click();
  await expect(entries(caio)).toHaveText([/Bandido/, /Kael/, /Gigante/]);
  await expect(turnLine(caio)).toHaveText('Rodada 1 · Vez de Bandido');
  // On its turn the group is open.
  await expect(tokensOf(caio, 'Bandido')).toHaveText([/Bandido 1/, /Bandido 2/]);

  // A copy of Bandido 1 pasted on another cell joins its entry.
  await tokensOf(admin, 'Bandido')
    .getByRole('button', { name: /^Bandido 1/ })
    .click();
  await admin.keyboard.press('Control+c');
  await expect(statusOf(admin)).toHaveText('1 item copiado.');
  const target = await cellCenterOf(admin, 14, 3);
  await admin.mouse.move(target.x, target.y);
  await admin.keyboard.press('Control+v');
  await expect(tokensOf(caio, 'Bandido')).toHaveCount(3);

  // "Separar" gives Bandido 2 an entry of its own, at the end and without initiative.
  await choose(admin, 'Mais ações de Bandido 2', 'Separar');
  await expect(entries(caio).last()).toHaveText(/^—.*Bandido 2/);

  // Adding mid-fight: the Lobo enters with 12, after Kael (the tie keeps the order of entry).
  await createToken(admin, 'Lobo', null, 'Inimigo');
  await choose(admin, 'Mais opções do combate', 'Adicionar ao combate');
  await expect(admin.getByRole('heading', { name: 'Adicionar ao combate' })).toBeVisible();
  await typeInitiative(admin, 'Lobo', '12');
  await admin.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(entries(caio)).toHaveText([/Bandido/, /Kael/, /Lobo/, /Gigante/, /Bandido 2/]);

  // Delete asks first; deleting the last bandits of the entry takes it out.
  const bandits = tokensOf(admin, 'Bandido').getByRole('button', { name: /^Bandido 1/ });
  await deleteFromTheBoard(admin, bandits.first(), 'Excluir Bandido 1?');
  await expect(tokensOf(caio, 'Bandido')).toHaveCount(1);
  // The admin's own list too: a line still there is the deleted token, pressed and deleted again.
  await expect(tokensOf(admin, 'Bandido')).toHaveCount(1);
  await deleteFromTheBoard(admin, bandits.first(), 'Excluir Bandido 1?');
  await expect(entries(caio)).toHaveText([/Kael/, /Lobo/, /Gigante/, /Bandido 2/]);

  // A lair with 20 goes first.
  await choose(admin, 'Mais opções do combate', 'Entrada sem token');
  await admin.getByLabel('Nome da entrada').fill('Covil');
  await admin.getByLabel('Iniciativa', { exact: true }).fill('20');
  await admin.getByRole('button', { name: 'Criar entrada' }).click();
  await expect(entries(caio).first()).toHaveText(/Covil/);

  await choose(admin, 'Mais ações de Gigante', 'Renomear');
  const rename = admin.getByLabel('Nome de Gigante');
  await rename.fill('Chefe');
  await rename.press('Enter');
  await expect(entries(caio).nth(3)).toHaveText(/Chefe/);
});
