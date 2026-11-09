import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, type Response } from '@playwright/test';
import { BIA } from './dev-players';
import { campaignIdOf, changeDocument, type DocumentRecord } from './documents';
import { chooseNewItemKind, gridItemOf, openLibrary, pickGrid } from './library';
import { adminCredentials, signIn } from './sign-in';
import { createTableAndReadCode, enterFromTheList, joinByCodeAndEnter } from './tables';

const MAP_IMAGE = fileURLToPath(new URL('../fixtures/mapa-1400x700.png', import.meta.url));
const MAP_IMAGE_WIDTH = 1400;

/** A point of the map, as a share of its image (0 to 1). */
export type MapSpot = Readonly<{ x: number; y: number }>;
/** A point of the viewport, in pixels. */
export type ScreenPoint = Readonly<{ x: number; y: number }>;
export type ScreenBox = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>;
export type MapVisibility = 'Privado' | 'Público';
export type SeatedTable = Readonly<{ ana: Page; bia: Page; table: string }>;
type NewPage = () => Promise<Page>;

function uniqueTableName(label: string): string {
  return `${label} ${Date.now()}`;
}

/** Ana (the admin) alone in a table of her own, on the room. Example: `const ana = await seatAna(newPlayerPage, 'Pinos')` */
export async function seatAna(newPage: NewPage, label: string): Promise<Page> {
  const ana = await newPage();
  const table = uniqueTableName(label);
  await signIn(ana, adminCredentials());
  await createTableAndReadCode(ana, table);
  await enterFromTheList(ana, table);
  return ana;
}

/** Ana (the admin) and Bia (a player) in a new table, both on the room, which has no main map yet.
 *
 *  Example: `const { ana, bia } = await seatAnaAndBia(newPlayerPage, 'Trilha')` */
export async function seatAnaAndBia(newPage: NewPage, label: string): Promise<SeatedTable> {
  const ana = await newPage();
  const bia = await newPage();
  const table = uniqueTableName(label);
  await signIn(ana, adminCredentials());
  const code = await createTableAndReadCode(ana, table);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, ana);
  await enterFromTheList(ana, table);
  return { ana, bia, table };
}

/** Bia in a browser of her own, entering a table she already belongs to and landing on its main
 *  map: `enterFromTheList` cannot be used, because it waits for the board the map replaces.
 *
 *  Example: `const arriving = await arriveOnMainMap(newPlayerPage, table, 'Mundo')` */
export async function arriveOnMainMap(
  newPage: NewPage,
  table: string,
  mapName: string,
): Promise<Page> {
  const page = await newPage();
  await signIn(page, BIA);
  await page.getByRole('link', { name: table }).click();
  await page
    .getByRole('dialog', { name: table })
    .getByRole('button', { name: 'Entrar na mesa' })
    .click();
  await expectMapOnScreen(page, mapName);
  return page;
}

/** Prepares a document by the route, in the table open in `page`.
 *
 *  Example: `await createDocumentByRoute(ana, 'Diário', 'public')` */
export async function createDocumentByRoute(
  page: Page,
  name: string,
  visibility: 'private' | 'public',
): Promise<void> {
  const response = await page.request.post(`/api/campaigns/${campaignIdOf(page)}/documents`, {
    data: { actionId: crypto.randomUUID(), name },
  });
  expect(response.status(), `creation of the document ${name}`).toBe(201);
  const answer: { document: DocumentRecord } = await response.json();
  if (visibility === 'public') await changeDocument(page, answer.document.id, { visibility });
}

/** The image of the map on screen in the room, named after the map. */
export function mapImageOf(page: Page, mapName: string): Locator {
  return page.getByRole('img', { name: mapName, exact: true });
}

/** The SVG over the map, as large as the map's frame. */
export function mapRegionsOf(page: Page): Locator {
  return page.getByRole('group', { name: 'Regiões do mapa' });
}

/** A place drawn on the map, by its name ("Cripta (oculta)" for a master looking at a hidden one). */
export function mapRegionOf(page: Page, name: string): Locator {
  return mapRegionsOf(page).getByRole('button', { name, exact: true });
}

/** The card of a place. Example: `await expect(mapCardOf(bia, 'Capital')).toBeVisible()` */
export function mapCardOf(page: Page, placeName: string): Locator {
  return page.getByRole('region', { name: placeName, exact: true });
}

/** The way through the maps, above the one shown. */
export function mapTrailOf(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Trilha de mapas' });
}

/** The form of a place in the editor. */
export function placeFormOf(page: Page, placeName: string): Locator {
  return page.getByRole('region', { name: `Dados de ${placeName}`, exact: true });
}

/** A place's row in "Lugares neste mapa": the map's own regions are buttons of that name too. */
export function placeRowOf(page: Page, placeName: string): Locator {
  return page.getByRole('listitem').getByRole('button', { name: placeName, exact: true });
}

/** Waits for the map's image, framed (the layer is invisible until then) and loaded. */
export async function expectMapOnScreen(page: Page, mapName: string): Promise<void> {
  const image = mapImageOf(page, mapName);
  await expect(image).toBeVisible();
  await expect(image).toHaveJSProperty('naturalWidth', MAP_IMAGE_WIDTH);
}

/** The on-screen box of an element that must be there. Example: `const box = await boxOf(card)` */
export async function boxOf(element: Locator): Promise<ScreenBox> {
  const box = await element.boundingBox();
  if (!box) throw new Error(`expected ${element.toString()} to have a box on screen; it has none`);
  return box;
}

/** Where a point of the map is on screen now, from the box of the transformed image.
 *
 *  Example: `const point = await screenPointOf(bia, 'Mundo', { x: 0.3, y: 0.5 })` */
export async function screenPointOf(
  page: Page,
  mapName: string,
  spot: MapSpot,
): Promise<ScreenPoint> {
  const box = await boxOf(mapImageOf(page, mapName));
  return { x: box.x + spot.x * box.width, y: box.y + spot.y * box.height };
}

/** Clicks a point of the map with the real mouse; resolves to the screen point clicked.
 *
 *  Example: `const clicked = await clickOnMap(bia, 'Mundo', CAPITAL)` */
export async function clickOnMap(page: Page, mapName: string, spot: MapSpot): Promise<ScreenPoint> {
  const point = await screenPointOf(page, mapName, spot);
  await page.mouse.click(point.x, point.y);
  return point;
}

/** Double-clicks a point of the map with the real mouse. Example: `await doubleClickOnMap(bia, 'Mundo', CAPITAL)` */
export async function doubleClickOnMap(page: Page, mapName: string, spot: MapSpot): Promise<void> {
  const point = await screenPointOf(page, mapName, spot);
  await page.mouse.dblclick(point.x, point.y);
}

/** The four corners of a rectangle around a point: its center of mass is that point.
 *
 *  Example: `rectangleAround({ x: 0.3, y: 0.5 }, 0.06, 0.1)` */
export function rectangleAround(center: MapSpot, halfWidth: number, halfHeight: number): MapSpot[] {
  return [
    { x: center.x - halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y - halfHeight },
    { x: center.x + halfWidth, y: center.y + halfHeight },
    { x: center.x - halfWidth, y: center.y + halfHeight },
  ];
}

/** "Criar item" → "Mapa", with the 1400 × 700 fixture, at the root of the open library.
 *
 *  Example: `await createMap(library, 'Mundo', 'Público')` */
export async function createMap(
  library: Locator,
  name: string,
  visibility: MapVisibility,
): Promise<void> {
  const page = library.page();
  await library.getByRole('button', { name: 'Criar item' }).click();
  const form = await chooseNewItemKind(page, 'Mapa');
  await form.getByRole('textbox', { name: 'Nome', exact: true }).fill(name);
  await form.getByLabel('Arquivo de imagem').setInputFiles(MAP_IMAGE);
  await expect(form.getByRole('img', { name: 'Imagem escolhida' })).toBeVisible();
  const radio = form.getByRole('radio', { name: visibility, exact: true });
  await radio.click();
  await expect(radio).toBeChecked();
  const saved = page.waitForResponse(isPostTo('/library-maps'));
  await form.getByRole('button', { name: 'Criar', exact: true }).click();
  expect((await saved).status(), `creation of the map ${name}`).toBe(201);
  await expect(form).toBeHidden();
  await expect(gridItemOf(library, name)).toBeVisible();
}

function isPostTo(pathEnd: string): (response: Response) => boolean {
  return (response) => response.request().method() === 'POST' && response.url().endsWith(pathEnd);
}

function mapDetailsOf(library: Locator): Locator {
  return library.getByRole('region', { name: 'Mapa escolhido' });
}

/** Picks a map in the open library and opens it in the room's map tab; the library closes.
 *
 *  Example: `await openMapOf(library, 'Mundo')` */
export async function openMapOf(library: Locator, name: string): Promise<void> {
  await pickGrid(library, name);
  await mapDetailsOf(library).getByRole('button', { name: 'Abrir', exact: true }).click();
  await expect(library).toBeHidden();
  await expectMapOnScreen(library.page(), name);
}

/** From the room: the library, then the map. Example: `await openMapFromRoom(bia, 'Mundo')` */
export async function openMapFromRoom(page: Page, name: string): Promise<void> {
  await openMapOf(await openLibrary(page), name);
}

/** Picks a map in the open library and marks it as the main one, waiting for the confirmation.
 *
 *  Example: `await markMainMap(library, 'Mundo')` */
export async function markMainMap(library: Locator, name: string): Promise<void> {
  await pickGrid(library, name);
  const details = mapDetailsOf(library);
  await details.getByRole('button', { name: 'Marcar como principal' }).click();
  await expect(details.getByRole('button', { name: 'Deixar de ser principal' })).toBeVisible();
}

/** Opens the editor of the map on screen. Example: `await startEditingMap(ana)` */
export async function startEditingMap(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Editar mapa' }).click();
  await expect(editorToolbarOf(page)).toBeVisible();
}

function editorToolbarOf(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Editor do mapa' });
}

async function takeTool(page: Page, tool: 'Polígono' | 'Pino'): Promise<void> {
  const button = editorToolbarOf(page).getByRole('button', { name: tool });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** Draws a polygon by real clicks, closes it with Enter and names it; resolves to its form.
 *
 *  Example: `const form = await drawPolygon(ana, 'Mundo', rectangleAround(CAPITAL, 0.06, 0.1), 'Capital')` */
export async function drawPolygon(
  page: Page,
  mapName: string,
  spots: readonly MapSpot[],
  placeName: string,
): Promise<Locator> {
  await takeTool(page, 'Polígono');
  for (const spot of spots) await clickOnMap(page, mapName, spot);
  await expect(page.getByRole('status').filter({ hasText: `${spots.length} de ` })).toBeVisible();
  const created = page.waitForResponse(isPostTo('/regions'));
  await page.keyboard.press('Enter');
  expect((await created).status(), `creation of the place ${placeName}`).toBe(201);
  return nameNewPlace(page, placeName);
}

/** Draws a pin by a real click and names it; resolves to its form.
 *
 *  Example: `const form = await drawPin(ana, 'Mundo', { x: 0.4, y: 0.5 }, 'Forte')` */
export async function drawPin(
  page: Page,
  mapName: string,
  spot: MapSpot,
  placeName: string,
): Promise<Locator> {
  await takeTool(page, 'Pino');
  const created = page.waitForResponse(isPostTo('/regions'));
  await clickOnMap(page, mapName, spot);
  expect((await created).status(), `creation of the place ${placeName}`).toBe(201);
  return nameNewPlace(page, placeName);
}

async function nameNewPlace(page: Page, placeName: string): Promise<Locator> {
  const field = placeFormOf(page, 'Novo lugar').getByLabel('Nome', { exact: true });
  await field.fill(placeName);
  await field.press('Enter');
  const form = placeFormOf(page, placeName);
  await expect(form).toBeVisible();
  return form;
}

/** Links a place to an item, by the label of its row ("Documento: Diário", "Mapa: Reino").
 *
 *  Example: `await linkPlaceTo(form, 'Documento: Diário')` */
export async function linkPlaceTo(form: Locator, itemLabel: string): Promise<void> {
  await form.getByRole('button', { name: itemLabel, exact: true }).click();
  await expect(form.getByRole('button', { name: 'Trocar item' })).toBeVisible();
}

/** Marks a place "Oculta para jogadores". Example: `await hidePlaceFromPlayers(form)` */
export async function hidePlaceFromPlayers(form: Locator): Promise<void> {
  const hidden = form.getByRole('switch', { name: 'Oculta para jogadores' });
  await hidden.click();
  await expect(hidden).toBeChecked();
}

/** Picks the icon of a pin in the "Ícone" field, by its label. Example: `await choosePinIcon(form, 'Castelo')` */
export async function choosePinIcon(form: Locator, iconLabel: string): Promise<void> {
  const icon = form
    .getByRole('group', { name: 'Ícone', exact: true })
    .getByRole('button', { name: iconLabel, exact: true });
  await icon.click();
  await expect(icon).toHaveAttribute('aria-pressed', 'true');
}

/** "Concluir" in the editor, then closes the card the chosen place turns into, which would sit over
 *  the map.
 *
 *  Example: `await finishEditingMap(ana)` */
export async function finishEditingMap(page: Page): Promise<void> {
  await editorToolbarOf(page).getByRole('button', { name: 'Concluir' }).click();
  await expect(editorToolbarOf(page)).toBeHidden();
  const closeCard = page.getByRole('button', { name: 'Fechar cartão' });
  if (await closeCard.isVisible()) await closeCard.click();
}

/** Opens "Lugares neste mapa". Example: `await openPlacesList(bia)` */
export async function openPlacesList(page: Page): Promise<void> {
  const list = page.getByRole('button', { name: 'Lugares neste mapa' });
  await list.click();
  await expect(list).toHaveAttribute('aria-expanded', 'true');
}

/** How far, in pixels, the middle of a place is from the middle of the map's frame.
 *
 *  Example: `await expect.poll(() => distanceFromFrameCenter(bia, 'Capital')).toBeLessThan(24)` */
export async function distanceFromFrameCenter(page: Page, placeName: string): Promise<number> {
  const frame = await boxOf(mapRegionsOf(page));
  const place = await boxOf(mapRegionOf(page, placeName));
  return Math.hypot(
    place.x + place.width / 2 - (frame.x + frame.width / 2),
    place.y + place.height / 2 - (frame.y + frame.height / 2),
  );
}
