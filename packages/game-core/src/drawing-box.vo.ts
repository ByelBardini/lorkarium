import type { SceneSize } from './grid';

/** The bounding box of a drawing in fractional cells (x = 3.5 is the middle of the fourth column):
 *  top-left corner and size, all finite and ≥ 0. Cells, never pixels, so zoom never moves a drawing. */
export type DrawingBox = Readonly<{ x: number; y: number; width: number; height: number }>;

type BoxAxis = keyof DrawingBox;

/** Builds a drawing box, refusing a coordinate or size that is not a finite number ≥ 0.
 *  A zero width or height is a straight freehand line.
 *
 *  Example: `drawingBox(2.5, 1, 3, 2)` → `{ x: 2.5, y: 1, width: 3, height: 2 }` */
export function drawingBox(x: number, y: number, width: number, height: number): DrawingBox {
  const box = { x, y, width, height };
  for (const axis of ['x', 'y', 'width', 'height'] as const) assertBoxValue(axis, box[axis]);
  return Object.freeze(box);
}

/** Whether the box stays inside the scene; touching the far edge fits.
 *
 *  Example: `boxFits({ widthCells: 20, heightCells: 12 }, drawingBox(17, 10, 3, 2))` → `true` */
export function boxFits(scene: SceneSize, box: DrawingBox): boolean {
  return (
    inHundredths(box.x + box.width) <= inHundredths(scene.widthCells) &&
    inHundredths(box.y + box.height) <= inHundredths(scene.heightCells)
  );
}

/** The same box moved by a delta in cells; the original is untouched.
 *
 *  Example: `translateBox(drawingBox(2, 3, 2, 2), 1.5, -1)` → `{ x: 3.5, y: 2, width: 2, height: 2 }` */
export function translateBox(box: DrawingBox, dx: number, dy: number): DrawingBox {
  return drawingBox(box.x + dx, box.y + dy, box.width, box.height);
}

// Drawings are stored to 0.01 cell; comparing in hundredths keeps 19.9 + 0.1 from overshooting 20.
function inHundredths(value: number): number {
  return Math.round(value * 100);
}

function assertBoxValue(axis: BoxAxis, value: number): void {
  if (Number.isFinite(value) && value >= 0) return;
  throw new RangeError(
    `Drawing box ${axis} ${String(value)} is invalid: expected número finito ≥ 0.`,
  );
}
