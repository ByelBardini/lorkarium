import type { Page } from '@playwright/test';
import { boardOf } from './tables';

// The default scene: 20 × 12 cells of 64 world px; "Enquadrar cena" centers it with a 32 px margin.
const SCENE = { widthCells: 20, heightCells: 12, cell: 64, margin: 32 };

export type SceneCells = Readonly<{ widthCells: number; heightCells: number }>;

/** Screen point of the center of cell (col, row), after "Enquadrar cena" frames the scene.
 *
 *  Example: `const from = await cellCenterOf(admin, 11, 6); await admin.mouse.move(from.x, from.y)` */
export async function cellCenterOf(
  page: Page,
  col: number,
  row: number,
  scene: SceneCells = SCENE,
): Promise<{ x: number; y: number }> {
  await page.getByRole('button', { name: 'Enquadrar cena (0)' }).click();
  const box = await boardOf(page).boundingBox();
  if (!box) throw new Error('the board has no box');
  const width = scene.widthCells * SCENE.cell;
  const height = scene.heightCells * SCENE.cell;
  const fit = Math.min(
    (box.width - 2 * SCENE.margin) / width,
    (box.height - 2 * SCENE.margin) / height,
  );
  const zoom = Math.min(4, Math.max(0.25, fit));
  const left = box.x + (box.width - width * zoom) / 2;
  const top = box.y + (box.height - height * zoom) / 2;
  return { x: left + (col + 0.5) * SCENE.cell * zoom, y: top + (row + 0.5) * SCENE.cell * zoom };
}

/** Presses on one cell and moves to another in small steps, as a hand drags, without releasing:
 *  the caller drops (`page.mouse.up()`) or cancels (Escape). The board is focused first, so the
 *  keys reach it during the drag.
 *
 *  Example: `await holdDragBetweenCells(bia, [4, 6], [10, 6]); await bia.keyboard.press('Escape')` */
export async function holdDragBetweenCells(
  page: Page,
  [fromCol, fromRow]: readonly [number, number],
  [toCol, toRow]: readonly [number, number],
): Promise<void> {
  const from = await cellCenterOf(page, fromCol, fromRow);
  const to = await cellCenterOf(page, toCol, toRow);
  await boardOf(page).focus();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
}

/** Alt + click on the center of a cell: the ping, with any tool.
 *
 *  Example: `await altClickCell(admin, 5, 2); await expect(statusOf(bia)).toContainText('coluna 6, linha 3')` */
export async function altClickCell(page: Page, col: number, row: number): Promise<void> {
  const at = await cellCenterOf(page, col, row);
  await page.keyboard.down('Alt');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Alt');
}

/** Presses on one cell and releases on another in small steps, as a hand drags.
 *
 *  Example: `await dragBetweenCells(caio, [2, 2], [5, 4])` */
export async function dragBetweenCells(
  page: Page,
  from: readonly [number, number],
  to: readonly [number, number],
): Promise<void> {
  await holdDragBetweenCells(page, from, to);
  await page.mouse.up();
}
