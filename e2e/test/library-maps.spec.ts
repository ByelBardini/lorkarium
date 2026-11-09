import { expect, type Locator, type Page } from '@playwright/test';
import { documentPanelOf } from './support/documents';
import { createGrid, gridItemOf, gridTabsOf, openLibrary, takeTheGroupTo } from './support/library';
import {
  arriveOnMainMap,
  boxOf,
  choosePinIcon,
  clickOnMap,
  createDocumentByRoute,
  createMap,
  distanceFromFrameCenter,
  doubleClickOnMap,
  drawPin,
  drawPolygon,
  expectMapOnScreen,
  finishEditingMap,
  hidePlaceFromPlayers,
  linkPlaceTo,
  mapCardOf,
  mapImageOf,
  mapRegionOf,
  mapRegionsOf,
  mapTrailOf,
  markMainMap,
  openMapFromRoom,
  openMapOf,
  openPlacesList,
  placeRowOf,
  rectangleAround,
  seatAna,
  seatAnaAndBia,
  startEditingMap,
  type MapSpot,
  type MapVisibility,
  type ScreenPoint,
} from './support/maps';
import { test } from './support/player-pages';
import { boardOf } from './support/tables';

test.describe.configure({ timeout: 120_000 });

const WORLD = 'Mundo';
// Left of the middle and clear of the master's column on the right; also what makes "centered" bite.
const CAPITAL: MapSpot = { x: 0.3, y: 0.45 };
const CAPITAL_CORNERS = rectangleAround(CAPITAL, 0.06, 0.1);

async function createWorldAndEdit(ana: Page, visibility: MapVisibility): Promise<void> {
  const library = await openLibrary(ana);
  await createMap(library, WORLD, visibility);
  await openMapOf(library, WORLD);
  await startEditingMap(ana);
}

async function expectCardBeside(
  card: Locator,
  clicked: ScreenPoint,
  side: 'left' | 'right',
): Promise<void> {
  const box = await boxOf(card);
  const gap = side === 'right' ? box.x - clicked.x : clicked.x - (box.x + box.width);
  expect(gap, `gap to the ${side} of the click`).toBeGreaterThan(4);
  expect(gap, `gap to the ${side} of the click`).toBeLessThan(40);
  expect(clicked.y).toBeGreaterThan(box.y);
  expect(clicked.y).toBeLessThan(box.y + box.height);
}

test.describe('main map', () => {
  test('Ana draws, links and marks it; Bia arrives on it, gets the card, opens the document and returns by the table name', async ({
    newPlayerPage,
  }) => {
    const { ana, bia, table } = await seatAnaAndBia(newPlayerPage, 'Principal');
    // She enters again further down: the map opens only on arrival, never in the middle of a visit.
    await bia.close();
    await createDocumentByRoute(ana, 'Diário', 'public');
    await createWorldAndEdit(ana, 'Privado');
    const form = await drawPolygon(ana, WORLD, CAPITAL_CORNERS, 'Capital');
    await linkPlaceTo(form, 'Documento: Diário');
    await finishEditingMap(ana);
    await markMainMap(await openLibrary(ana), WORLD);

    const arriving = await arriveOnMainMap(newPlayerPage, table, WORLD);
    await expect(gridTabsOf(arriving).getByRole('tab', { name: WORLD, exact: true })).toHaveCount(
      0,
    );
    await expect(arriving.getByTitle('Abrir o mapa principal')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await arriving.reload();
    await expectMapOnScreen(arriving, WORLD);
    await clickOnMap(arriving, WORLD, CAPITAL);
    const card = mapCardOf(arriving, 'Capital');
    await expect(card.getByText('Documento: Diário')).toBeVisible();
    await doubleClickOnMap(arriving, WORLD, CAPITAL);
    await expect(documentPanelOf(arriving)).toBeVisible();
    await expect(
      gridTabsOf(arriving).getByRole('tab', { name: 'Diário', exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
    await arriving.getByTitle('Abrir o mapa principal').click();
    await expectMapOnScreen(arriving, WORLD);
    await expect(documentPanelOf(arriving)).toBeHidden();
  });

  test('deleting the main map is refused and it stays in the library', async ({
    newPlayerPage,
  }) => {
    const ana = await seatAna(newPlayerPage, 'Recusa');
    const library = await openLibrary(ana);
    await createMap(library, WORLD, 'Privado');
    await markMainMap(library, WORLD);
    await library
      .getByRole('region', { name: 'Mapa escolhido' })
      .getByRole('button', { name: 'Excluir mapa' })
      .click();
    await ana
      .getByRole('alertdialog', { name: `Excluir ${WORLD}?` })
      .getByRole('button', { name: 'Excluir', exact: true })
      .click();
    await expect(
      library
        .getByRole('status')
        .filter({ hasText: 'Escolha outro mapa principal antes de excluir este.' }),
    ).toBeVisible();
    await expect(gridItemOf(library, WORLD)).toBeVisible();
  });
});

test.describe('what the player may see', () => {
  test('a hidden place reaches neither the map nor the list of the player', async ({
    newPlayerPage,
  }) => {
    const { ana, bia } = await seatAnaAndBia(newPlayerPage, 'Oculta');
    await createWorldAndEdit(ana, 'Público');
    await drawPolygon(ana, WORLD, CAPITAL_CORNERS, 'Praça');
    const crypt = await drawPolygon(
      ana,
      WORLD,
      rectangleAround({ x: 0.5, y: 0.6 }, 0.05, 0.08),
      'Cripta',
    );
    await hidePlaceFromPlayers(crypt);
    await finishEditingMap(ana);
    await expect(mapRegionOf(ana, 'Cripta (oculta)')).toBeVisible();

    await openMapFromRoom(bia, WORLD);
    await expect(mapRegionOf(bia, 'Praça')).toBeVisible();
    await expect(mapRegionsOf(bia).getByRole('button')).toHaveCount(1);
    await openPlacesList(bia);
    await expect(placeRowOf(bia, 'Praça')).toBeVisible();
    await expect(placeRowOf(bia, 'Cripta')).toHaveCount(0);
  });

  test('a link to a private document only says the master has not revealed it', async ({
    newPlayerPage,
  }) => {
    const { ana, bia } = await seatAnaAndBia(newPlayerPage, 'Segredo');
    await createDocumentByRoute(ana, 'Plano do vilão', 'private');
    await createWorldAndEdit(ana, 'Público');
    const form = await drawPolygon(ana, WORLD, CAPITAL_CORNERS, 'Torre');
    await linkPlaceTo(form, 'Documento: Plano do vilão');
    await finishEditingMap(ana);

    await openMapFromRoom(bia, WORLD);
    await clickOnMap(bia, WORLD, CAPITAL);
    const card = mapCardOf(bia, 'Torre');
    await expect(card.getByText('O mestre ainda não revelou isto')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Abrir', exact: true })).toHaveCount(0);
    await expect(card).not.toContainText('Plano do vilão');
  });
});

test.describe('trail', () => {
  test('a link to another map takes Bia there with a trail, and the trail brings her back', async ({
    newPlayerPage,
  }) => {
    const { ana, bia } = await seatAnaAndBia(newPlayerPage, 'Trilha');
    const library = await openLibrary(ana);
    await createMap(library, 'Reino', 'Público');
    await createMap(library, WORLD, 'Público');
    await openMapOf(library, WORLD);
    await startEditingMap(ana);
    const form = await drawPolygon(ana, WORLD, CAPITAL_CORNERS, 'Portal');
    await linkPlaceTo(form, 'Mapa: Reino');
    await finishEditingMap(ana);

    await openMapFromRoom(bia, WORLD);
    await expect(mapTrailOf(bia)).toHaveCount(0);
    await doubleClickOnMap(bia, WORLD, CAPITAL);
    await expectMapOnScreen(bia, 'Reino');
    await expect(mapTrailOf(bia).locator('[aria-current="page"]')).toHaveText('Reino');
    await mapTrailOf(bia).getByRole('button', { name: WORLD, exact: true }).click();
    await expectMapOnScreen(bia, WORLD);
    await expect(mapTrailOf(bia)).toHaveCount(0);
  });
});

test.describe('group moments', () => {
  test('"Mostrar a todos" brings Bia from the board to the place, centered, with its card', async ({
    newPlayerPage,
  }) => {
    const { ana, bia } = await seatAnaAndBia(newPlayerPage, 'Mostrar');
    await createWorldAndEdit(ana, 'Público');
    await drawPolygon(ana, WORLD, CAPITAL_CORNERS, 'Capital');
    await finishEditingMap(ana);
    await expect(boardOf(bia)).toBeVisible();

    await clickOnMap(ana, WORLD, CAPITAL);
    await mapCardOf(ana, 'Capital').getByRole('button', { name: 'Mostrar a todos' }).click();
    await expectMapOnScreen(bia, WORLD);
    await expect(mapCardOf(bia, 'Capital')).toBeVisible();
    await expect.poll(() => distanceFromFrameCenter(bia, 'Capital')).toBeLessThan(24);
  });

  test('activating a grid brings Bia from the map back to the board', async ({ newPlayerPage }) => {
    const { ana, bia } = await seatAnaAndBia(newPlayerPage, 'Grupo');
    const library = await openLibrary(ana);
    await createGrid(library, 'Estrada');
    await createMap(library, WORLD, 'Público');
    await openMapFromRoom(bia, WORLD);

    await takeTheGroupTo(library, 'Estrada');
    await expect(boardOf(bia)).toHaveAccessibleName(/^Tabuleiro: Estrada/);
    await expect(mapImageOf(bia, WORLD)).toBeHidden();
  });
});

test.describe('place card', () => {
  test('opens beside the click, on the side with room, without covering it', async ({
    newPlayerPage,
  }) => {
    const ana = await seatAna(newPlayerPage, 'Cartao');
    const west: MapSpot = { x: 0.25, y: 0.5 };
    const east: MapSpot = { x: 0.85, y: 0.65 };
    await createWorldAndEdit(ana, 'Privado');
    await drawPolygon(ana, WORLD, rectangleAround(west, 0.06, 0.1), 'Oeste');
    await drawPolygon(ana, WORLD, rectangleAround(east, 0.06, 0.1), 'Leste');
    await finishEditingMap(ana);

    const clickedWest = await clickOnMap(ana, WORLD, west);
    await expect(mapCardOf(ana, 'Oeste')).toBeVisible();
    await expectCardBeside(mapCardOf(ana, 'Oeste'), clickedWest, 'right');
    const clickedEast = await clickOnMap(ana, WORLD, east);
    await expect(mapCardOf(ana, 'Leste')).toBeVisible();
    await expectCardBeside(mapCardOf(ana, 'Leste'), clickedEast, 'left');
  });
});

test.describe('places list', () => {
  test('a pin drawn with a chosen icon shows it on the map and in the list', async ({
    newPlayerPage,
  }) => {
    const ana = await seatAna(newPlayerPage, 'Icone');
    await createWorldAndEdit(ana, 'Privado');
    const form = await drawPin(ana, WORLD, { x: 0.4, y: 0.5 }, 'Forte');
    await choosePinIcon(form, 'Castelo');
    await finishEditingMap(ana);

    await expect(mapRegionsOf(ana).locator('[data-pin-icon="castle"]')).toBeVisible();
    await openPlacesList(ana);
    await expect(placeRowOf(ana, 'Forte').locator('[data-pin-icon="castle"]')).toBeVisible();
  });

  test('the place inside a region shows only after expanding that region', async ({
    newPlayerPage,
  }) => {
    const ana = await seatAna(newPlayerPage, 'Hierarquia');
    const middle: MapSpot = { x: 0.4, y: 0.5 };
    await createWorldAndEdit(ana, 'Privado');
    await drawPolygon(ana, WORLD, rectangleAround(middle, 0.15, 0.2), 'Reino');
    await drawPin(ana, WORLD, middle, 'Vila');
    await finishEditingMap(ana);

    await openPlacesList(ana);
    await expect(placeRowOf(ana, 'Reino')).toBeVisible();
    await expect(placeRowOf(ana, 'Vila')).toHaveCount(0);
    await ana.getByRole('button', { name: 'Expandir Reino' }).click();
    await expect(placeRowOf(ana, 'Vila')).toBeVisible();
  });
});

test.describe('link picker', () => {
  test('the "Grids" filter leaves only the grids', async ({ newPlayerPage }) => {
    const ana = await seatAna(newPlayerPage, 'Filtro');
    await createDocumentByRoute(ana, 'Diário', 'public');
    const library = await openLibrary(ana);
    await createGrid(library, 'Estrada');
    await createMap(library, WORLD, 'Privado');
    await openMapOf(library, WORLD);
    await startEditingMap(ana);
    const form = await drawPin(ana, WORLD, { x: 0.4, y: 0.5 }, 'Porto');
    const items = form.getByRole('list', { name: 'Itens da biblioteca' });
    await expect(items.getByRole('button', { name: 'Documento: Diário' })).toBeVisible();

    const grids = form
      .getByRole('group', { name: 'Filtrar por tipo' })
      .getByRole('button', { name: 'Grids', exact: true });
    await grids.click();
    await expect(grids).toHaveAttribute('aria-pressed', 'true');
    await expect(items.getByRole('button', { name: 'Grid: Estrada' })).toBeVisible();
    await expect(items.getByRole('button', { name: 'Documento: Diário' })).toHaveCount(0);
  });
});
