import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page } from '@playwright/test';
import { cellCenterOf } from './support/board-cells';
import { meanChannelsAt } from './support/canvas-pixels';
import { BIA } from './support/dev-players';
import { test } from './support/player-pages';
import { adminCredentials, signIn } from './support/sign-in';
import {
  boardOf,
  createTableAndReadCode,
  enterFromTheList,
  joinByCodeAndEnter,
} from './support/tables';
import { cardOf, openCard, statusOf } from './support/token-cards';

// A tan 256 × 256 portrait: on the dark board, the cell under it leans to red over blue.
const PORTRAIT = fileURLToPath(new URL('./fixtures/token.png', import.meta.url));
// Both screens jump from cell to cell: the pose on screen is the cell of the step, no glide.
const STILL = { reducedMotion: 'reduce' } as const;

type Cell = readonly [number, number];
type Point = Readonly<{ x: number; y: number }>;

// A new token lands at the middle of the default scene.
const START: Cell = [10, 6];
// The route: the start, then two clicks (the patrol panel covers the columns left of 6).
const CORNER: Cell = [12, 6];
const END: Cell = [12, 9];
// Where Ana drops Kael, off the route.
const DROP: Cell = [8, 9];
// The cells the circuit is known to pass (the diagonal back to the start is the game-core's).
const ROUTE_CELLS: readonly Cell[] = [START, [11, 6], CORNER, [12, 7], [12, 8], END];
// "Devagar": half a cell per second, two seconds on each cell.
const ONE_CELL_MS = 2_000;
const POLL: { intervals: number[] } = { intervals: [250] };

// The portrait reads ~0.3 red over blue; the empty board ~0.
const KAEL_WARMTH = 0.15;

type CellPoints = (cell: Cell) => Point;

// The screen point of every cell used here, read once ("Enquadrar cena" frames the board).
async function cellPointsOf(page: Page): Promise<CellPoints> {
  const points = new Map<string, Point>();
  for (const cell of [...ROUTE_CELLS, DROP]) {
    points.set(cell.join(','), await cellCenterOf(page, ...cell));
  }
  return (cell) => {
    const point = points.get(cell.join(','));
    if (!point)
      throw new Error(
        `no screen point for cell ${cell.join(',')}; expected one of the route or the drop`,
      );
    return point;
  };
}

async function kaelIsAt(page: Page, at: CellPoints, cell: Cell): Promise<boolean> {
  const { r, b } = await meanChannelsAt(page, at(cell), 6);
  return r - b > KAEL_WARMTH;
}

async function routeCellOfKael(page: Page, at: CellPoints): Promise<Cell | null> {
  for (const cell of ROUTE_CELLS) {
    if (await kaelIsAt(page, at, cell)) return cell;
  }
  return null;
}

async function createKael(admin: Page): Promise<void> {
  await admin.getByRole('button', { name: 'Novo token' }).click();
  const dialog = admin.getByRole('dialog', { name: 'Novo token' });
  await dialog.getByLabel('Nome').fill('Kael');
  await dialog.getByLabel('Arquivo de imagem').setInputFiles(PORTRAIT);
  await expect(dialog.getByRole('img', { name: 'Imagem escolhida' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Criar token' }).click();
  await expect(dialog).toBeHidden();
}

async function kaelMenuAt(admin: Page, at: CellPoints, cell: Cell): Promise<Locator> {
  const { x, y } = at(cell);
  await admin.mouse.click(x, y, { button: 'right' });
  const menu = admin.getByRole('menu', { name: 'Ações de Kael' });
  await expect(menu).toBeVisible();
  return menu;
}

async function switchPatrol(
  admin: Page,
  at: CellPoints,
  cell: Cell,
  announced: string,
): Promise<void> {
  const menu = await kaelMenuAt(admin, at, cell);
  await menu.getByRole('menuitemcheckbox', { name: 'Patrulhando' }).click();
  await expect(statusOf(admin)).toContainText(announced);
}

// Clicks an empty corner: nothing selected, so the master's route trace is not drawn over the cells.
async function clearSelection(admin: Page): Promise<void> {
  const empty = await cellCenterOf(admin, 2, 10);
  await admin.mouse.click(empty.x, empty.y);
}

async function drawRoute(admin: Page, at: CellPoints): Promise<void> {
  const menu = await kaelMenuAt(admin, at, START);
  await menu.getByRole('menuitem', { name: 'Patrulha…' }).click();
  const panel = admin.getByRole('region', { name: 'Patrulha de Kael' });
  await expect(panel).toBeVisible();
  for (const cell of [CORNER, END]) {
    const { x, y } = at(cell);
    await admin.mouse.click(x, y);
  }
  await panel.getByRole('button', { name: 'Devagar' }).click();
  await expect(panel.getByRole('button', { name: 'Devagar' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel).toContainText(/^.*3 pontos · \d+ casas por volta/);
  await panel.getByRole('button', { name: 'Salvar' }).click();
  await expect(panel).toBeHidden();
}

test('the master draws and starts a patrol, the player sees the token walk, a drag pauses it and a reload keeps the stretch', async ({
  newPlayerPage,
}) => {
  test.setTimeout(240_000);
  const name = `Mesa patrulha ${Date.now()}`;
  const admin = await newPlayerPage(STILL);
  const bia = await newPlayerPage(STILL);
  await signIn(admin, adminCredentials());
  const code = await createTableAndReadCode(admin, name);
  await signIn(bia, BIA);
  await joinByCodeAndEnter(bia, code, admin);
  await enterFromTheList(admin, name);

  await createKael(admin);
  await openCard(bia, 'Kael');
  await expect(cardOf(bia, 'Kael')).toContainText('Coluna 11, linha 7');
  const anaAt = await cellPointsOf(admin);
  const biaAt = await cellPointsOf(bia);
  await expect.poll(() => kaelIsAt(bia, biaAt, START), POLL).toBe(true);
  expect(await kaelIsAt(bia, biaAt, CORNER)).toBe(false);

  // Ana: three points, "Devagar", saved; then "Patrulhando".
  await drawRoute(admin, anaAt);
  await switchPatrol(admin, anaAt, START, 'Kael patrulhando.');
  await clearSelection(admin);

  // Bia: Kael leaves the start within 3 s and goes through the corner and the end of the route.
  await expect.poll(() => kaelIsAt(bia, biaAt, START), { ...POLL, timeout: 3_000 }).toBe(false);
  await expect.poll(() => kaelIsAt(bia, biaAt, CORNER), { ...POLL, timeout: 15_000 }).toBe(true);
  await expect.poll(() => kaelIsAt(bia, biaAt, END), { ...POLL, timeout: 15_000 }).toBe(true);

  // Ana drags him off the corner on his next lap: the patrol pauses where he fell, for Bia too.
  await expect.poll(() => kaelIsAt(admin, anaAt, CORNER), { ...POLL, timeout: 30_000 }).toBe(true);
  const from = anaAt(CORNER);
  const to = anaAt(DROP);
  await boardOf(admin).focus();
  await admin.mouse.move(from.x, from.y);
  await admin.mouse.down();
  await admin.mouse.move(to.x, to.y, { steps: 8 });
  await admin.mouse.up();
  await expect.poll(() => kaelIsAt(bia, biaAt, DROP), POLL).toBe(true);
  // Bia's screen settling says nothing about Ana's: her right click hits what her own board shows.
  await expect.poll(() => kaelIsAt(admin, anaAt, DROP), POLL).toBe(true);
  const paused = await kaelMenuAt(admin, anaAt, DROP);
  await expect(paused.getByRole('menuitemcheckbox', { name: 'Patrulhando' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await admin.keyboard.press('Escape');
  await expect(paused).toBeHidden();
  // Longer than a step: a running patrol would have taken him away by now.
  await bia.waitForTimeout(2 * ONE_CELL_MS);
  expect(await kaelIsAt(bia, biaAt, DROP)).toBe(true);
  expect(await routeCellOfKael(bia, biaAt)).toBeNull();
  await openCard(bia, 'Kael');
  await expect(cardOf(bia, 'Kael')).toContainText('Coluna 9, linha 10');

  // Started again: he walks back from the drop (no jump) and joins the route.
  await switchPatrol(admin, anaAt, DROP, 'Kael patrulhando.');
  await clearSelection(admin);
  expect(await kaelIsAt(bia, biaAt, DROP)).toBe(true);
  await expect
    .poll(() => kaelIsAt(bia, biaAt, DROP), { ...POLL, timeout: 3 * ONE_CELL_MS })
    .toBe(false);
  await expect.poll(() => kaelIsAt(bia, biaAt, END), { ...POLL, timeout: 45_000 }).toBe(true);

  // Bia reloads mid-lap: the snapshot's start time puts him on the route, not on the stored cell
  // (while he walks, the stored cell is still the drop, the origin of the way back).
  await bia.reload();
  await expect(boardOf(bia)).toBeVisible();
  const reloadedAt = await cellPointsOf(bia);
  await expect
    .poll(() => routeCellOfKael(bia, reloadedAt), { ...POLL, timeout: 10_000 })
    .not.toBeNull();
  expect(await kaelIsAt(bia, reloadedAt, DROP)).toBe(false);
});
