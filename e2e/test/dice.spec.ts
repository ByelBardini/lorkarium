import { expect, type Locator, type Page } from '@playwright/test';
import { openAccount } from './support/account';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';

type DiceTable = Readonly<{ name: string; admin: Page; bia: Page; caio: Page | null }>;

/** The admin's table with Bia (and Caio, when asked) as players, everyone on the "Dados" tab. */
async function openDiceTable(
  newPlayerPage: () => Promise<Page>,
  withCaio: boolean,
): Promise<DiceTable> {
  const name = `Mesa dados ${Date.now()}`;
  const admin = await newPlayerPage();
  const bia = await newPlayerPage();
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  const caio = withCaio ? await newPlayerPage() : null;
  if (caio !== null) {
    await signIn(caio, CAIO);
    await joinByCodeAndEnter(caio, code, admin);
  }
  await enterFromTheList(admin, name);
  for (const page of [admin, bia, caio]) if (page !== null) await openDiceTab(page);
  return { name, admin, bia, caio };
}

async function openDiceTab(page: Page): Promise<void> {
  await expect(boardOf(page)).toBeVisible();
  await page.getByRole('tab', { name: 'Dados' }).click();
}

function historyOf(page: Page): Locator {
  return page.getByRole('list', { name: 'Histórico de rolagens' }).getByRole('listitem');
}

function newestTotalOf(page: Page): Locator {
  return historyOf(page).first().getByTestId('roll-total');
}

async function rollExpression(page: Page, expression: string, secret = false): Promise<void> {
  const panel = page.getByRole('tabpanel', { name: 'Dados' });
  await panel.getByLabel('Fórmula').fill(expression);
  if (secret) await panel.getByRole('radio', { name: 'Só o mestre' }).click();
  await panel.getByRole('button', { name: 'Rolar', exact: true }).click();
}

/** The total once the dice stop: "…" first, then a number. */
async function revealedTotalOf(page: Page): Promise<string> {
  await expect(newestTotalOf(page)).toHaveText(/^-?\d+$/, { timeout: 30_000 });
  return (await newestTotalOf(page).textContent()) ?? '';
}

function overlayOf(page: Page): Locator {
  return page.locator('canvas[data-dice-overlay]');
}

/** Whether the dice canvas paints anything: the screen with it and without it differ. */
async function overlayPaints(page: Page): Promise<boolean> {
  const withDice = await page.screenshot();
  await overlayOf(page).evaluate((canvas) => canvas.style.setProperty('visibility', 'hidden'));
  const withoutDice = await page.screenshot();
  await overlayOf(page).evaluate((canvas) => canvas.style.removeProperty('visibility'));
  return !withDice.equals(withoutDice);
}

test('Bia rolls 1d20+5: both pages wait on "…", then show the same total, with the 3D dice over the admin\'s screen', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { admin, bia } = await openDiceTable(newPlayerPage, false);

  await rollExpression(bia, '1d20+5');
  await expect(newestTotalOf(admin)).toHaveText('…');
  await expect(newestTotalOf(bia)).toHaveText('…');
  await expect(overlayOf(admin)).toBeVisible();
  const total = await revealedTotalOf(admin);
  expect(Number(total)).toBeGreaterThanOrEqual(6);
  expect(Number(total)).toBeLessThanOrEqual(25);
  await expect(newestTotalOf(bia)).toHaveText(total);
  // The die rests 3 s on screen after it stops: the canvas still paints it.
  expect(await overlayPaints(admin)).toBe(true);
  await expect(historyOf(admin).first()).toContainText('Bia');
});

test('with "Dados 3D" off in Minha conta, the next roll makes no canvas and the total still matches', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { admin, bia } = await openDiceTable(newPlayerPage, false);

  // "Dados 3D" lives in Minha conta, kept on the device: the room picks it up on the way back.
  await openAccount(admin);
  await admin.getByRole('switch', { name: 'Dados 3D' }).click();
  await expect(admin.getByRole('switch', { name: 'Dados 3D' })).not.toBeChecked();
  await admin.goBack();
  await openDiceTab(admin);
  await expect(admin.getByRole('switch', { name: 'Dados 3D' })).toHaveCount(0);
  await rollExpression(bia, '2d6');
  const total = await revealedTotalOf(bia);
  await expect(newestTotalOf(admin)).toHaveText(total);
  await expect(overlayOf(admin)).toHaveCount(0);
});

test('a roll "Só para o mestre" shows its value to the admin and only a notice to Caio', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { admin, bia, caio } = await openDiceTable(newPlayerPage, true);
  if (caio === null) throw new Error('the table was opened without Caio');

  await rollExpression(bia, '1d8', true);
  const total = await revealedTotalOf(admin);
  await expect(newestTotalOf(bia)).toHaveText(total);
  await expect(historyOf(caio).first()).toHaveText(/Bia rolou em segredo\./);
  await expect(historyOf(caio).first().getByTestId('roll-total')).toHaveCount(0);
});

function noticeOf(page: Page): Locator {
  return page.getByTestId('dice-roll-notice');
}

test('Bia saves "Acerto", rolls its tag and the history and the board notice show Acerto', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { admin, bia } = await openDiceTable(newPlayerPage, false);
  const panel = bia.getByRole('tabpanel', { name: 'Dados' });

  await saveExpression(panel, '1d20+5', 'Acerto');
  const saved = panel.getByRole('list', { name: 'Rolagens salvas' });
  await expect(saved.getByRole('listitem')).toHaveCount(1);

  await saved.getByRole('button', { name: 'Rolar Acerto' }).click();
  await expect(historyOf(admin).first()).toContainText('Acerto');
  const total = await revealedTotalOf(admin);
  expect(Number(total)).toBeGreaterThanOrEqual(6);
  expect(Number(total)).toBeLessThanOrEqual(25);
  // The notice lives 4 s after the dice stop, on both screens, with the same total.
  await Promise.all(
    [admin, bia].map((page) =>
      expect(noticeOf(page)).toContainText(new RegExp(`Bia rolou.*Acerto.*${total}`)),
    ),
  );
});

async function saveExpression(panel: Locator, expression: string, name: string): Promise<void> {
  await panel.getByLabel('Fórmula').fill(expression);
  await panel.getByRole('button', { name: 'Salvar esta rolagem' }).click();
  await panel.getByLabel('Nome da rolagem').fill(name);
  await panel.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(
    panel.getByRole('list', { name: 'Rolagens salvas' }).getByText(name, { exact: true }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Limpar' }).click();
}

test("an F5 keeps Bia's history; leaving the table and entering again starts it empty", async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { name, bia } = await openDiceTable(newPlayerPage, false);

  await rollExpression(bia, '1d6');
  const total = await revealedTotalOf(bia);
  await bia.reload();
  await openDiceTab(bia);
  await expect(historyOf(bia)).toHaveCount(1);
  await expect(newestTotalOf(bia)).toHaveText(total);

  await bia
    .getByRole('navigation', { name: 'Mesas abertas' })
    .getByRole('link', { name: new RegExp(name) })
    .click({ button: 'right' });
  await bia.getByRole('menuitem', { name: 'Sair da mesa' }).click();
  // The rail hides itself with no table left open: assert on the link, not on the rail.
  await expect(bia.getByRole('link', { name: new RegExp(name) })).toHaveCount(0);
  await bia.getByRole('link', { name: 'Mesas', exact: true }).click();
  await enterFromTheList(bia, name);
  await openDiceTab(bia);
  await expect(bia.getByText('Nenhuma rolagem nesta visita.')).toBeVisible();
});
