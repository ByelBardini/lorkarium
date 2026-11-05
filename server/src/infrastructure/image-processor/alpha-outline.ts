// Spoken in its own types: an adapter does not import a module (docs/context/assets.md, Armadilhas).
export type TracedPoint = readonly [number, number];
export type TracedOutline = readonly (readonly TracedPoint[])[];

/** The alpha channel of an image, one byte per cell, row by row. */
export type AlphaGrid = Readonly<{ width: number; height: number; alpha: Uint8Array }>;

type Span = readonly [from: number, to: number];
type Edge = Readonly<{ x: number; y: number; direction: number }>;
type Cells = Readonly<{ width: number; height: number; solid: Uint8Array }>;

/** The largest side of the grid worth tracing: a token never needs a finer silhouette. */
export const ALPHA_GRID_MAX_SIDE = 128;

const SOLID_FROM_ALPHA = 128;
const MIN_ISLAND_SHARE = 0.01;
const MAX_ISLANDS = 4;
const MAX_VERTICES = 48;
// In grid cells: just above the 0.71 a 45° staircase deviates from its chord, so the steps of a
// slope go away and a real notch of one cell stays.
const START_TOLERANCE = 0.75;
const TOLERANCE_GROWTH = 1.25;
const PRECISION = 10_000;

// Clockwise on screen (y grows down), so a walk keeps the solid cells on its right.
const STEPS: readonly TracedPoint[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
// The cell on the right and the one on the left of an edge leaving a vertex, per direction.
const SIDES: readonly (readonly [TracedPoint, TracedPoint])[] = [
  [
    [0, 0],
    [0, -1],
  ],
  [
    [-1, 0],
    [0, 0],
  ],
  [
    [-1, -1],
    [-1, 0],
  ],
  [
    [0, -1],
    [-1, -1],
  ],
];
// Left first: where two solid cells touch only by a corner the walk hops to the other one, so a
// shape stays one polygon. The holes are filled with the same reading of what touches.
const TURNS_IN_ORDER = [3, 0, 1];

/** Traces the silhouette of an alpha grid (marching squares over the cell corners, reduced by
 *  Ramer-Douglas-Peucker) into at most 4 polygons and 48 vertices, in a unit square where the
 *  grid sits contained and centred. Holes are not traced; an island under 1% of the grid falls.
 *  An empty list means nothing was solid enough.
 *
 *  Example: `outlineOfAlpha({ width: 2, height: 1, alpha: Uint8Array.of(255, 255) }) // [[[1, 0.25], [1, 0.75], [0, 0.75], [0, 0.25]]]` */
export function outlineOfAlpha(grid: AlphaGrid): TracedOutline {
  const { width, height, alpha } = grid;
  if (alpha.length !== width * height) {
    const size = `${width}×${height}`;
    throw new RangeError(
      `alpha of ${alpha.length} bytes for a ${size} grid; expected ${width * height}`,
    );
  }
  const cells: Cells = { width, height, solid: filledSolidCellsOf(grid) };
  const islands = largestIslandsOf(contoursOf(cells), width * height);
  return withinBudget(islands).map((island) => inUnitSquare(island, width, height));
}

function filledSolidCellsOf({ width, height, alpha }: AlphaGrid): Uint8Array {
  const solid = Uint8Array.from(alpha, (value) => (value >= SOLID_FROM_ALPHA ? 1 : 0));
  const open = openCellsOf({ width, height, solid });
  return solid.map((_, at) => (open[at] === 1 ? 0 : 1));
}

// What the outside reaches stays empty; anything else is a hole, or solid already. With no holes
// left every contour is an outer one, and a blob inside a ring goes with the ring.
function openCellsOf({ width, height, solid }: Cells): Uint8Array {
  const open = new Uint8Array(width * height);
  const pending: number[] = [];
  const visit = (x: number, y: number): void => {
    const at = y * width + x;
    if (x < 0 || y < 0 || x >= width || y >= height || solid[at] === 1 || open[at] === 1) return;
    open[at] = 1;
    pending.push(at);
  };
  for (let x = 0; x < width; x += 1) [0, height - 1].forEach((y) => visit(x, y));
  for (let y = 0; y < height; y += 1) [0, width - 1].forEach((x) => visit(x, y));
  for (let at = pending.pop(); at !== undefined; at = pending.pop()) {
    const [x, y] = [at % width, Math.floor(at / width)];
    STEPS.forEach(([stepX, stepY]) => visit(x + stepX, y + stepY));
  }
  return open;
}

function isSolid({ width, height, solid }: Cells, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height && solid[y * width + x] === 1;
}

function isContourEdge(cells: Cells, { x, y, direction }: Edge): boolean {
  const [right, left] = SIDES[direction] ?? [];
  if (!right || !left) return false;
  return isSolid(cells, x + right[0], y + right[1]) && !isSolid(cells, x + left[0], y + left[1]);
}

function edgeKey({ width }: Cells, { x, y, direction }: Edge): number {
  return (y * (width + 1) + x) * STEPS.length + direction;
}

function contoursOf(cells: Cells): TracedPoint[][] {
  const { width, height } = cells;
  const walked = new Set<number>();
  const contours: TracedPoint[][] = [];
  for (let at = 0; at < width * height; at += 1) {
    const start = { x: at % width, y: Math.floor(at / width), direction: 0 };
    if (isContourEdge(cells, start) && !walked.has(edgeKey(cells, start))) {
      contours.push(walkContour(cells, start, walked));
    }
  }
  return contours;
}

function walkContour(cells: Cells, start: Edge, walked: Set<number>): TracedPoint[] {
  const corners: TracedPoint[] = [];
  const startKey = edgeKey(cells, start);
  let edge = start;
  do {
    walked.add(edgeKey(cells, edge));
    const next = edgeAfter(cells, edge);
    if (next.direction !== edge.direction) corners.push([next.x, next.y]);
    edge = next;
  } while (edgeKey(cells, edge) !== startKey);
  return corners;
}

function edgeAfter(cells: Cells, { x, y, direction }: Edge): Edge {
  const [stepX, stepY] = STEPS[direction] ?? [0, 0];
  const origin = { x: x + stepX, y: y + stepY };
  for (const turn of TURNS_IN_ORDER) {
    const next = { ...origin, direction: (direction + turn) % STEPS.length };
    if (isContourEdge(cells, next)) return next;
  }
  throw new Error(`contour stops at ${origin.x},${origin.y}; expected a closed walk`);
}

function largestIslandsOf(contours: TracedPoint[][], gridArea: number): TracedPoint[][] {
  const minimum = gridArea * MIN_ISLAND_SHARE;
  return contours
    .map((contour) => ({ contour, area: areaOf(contour) }))
    .filter(({ area }) => area >= minimum)
    .sort((a, b) => b.area - a.area)
    .slice(0, MAX_ISLANDS)
    .map(({ contour }) => contour);
}

function areaOf(points: readonly TracedPoint[]): number {
  let doubled = 0;
  points.forEach(([x, y], at) => {
    const [nextX, nextY] = points[(at + 1) % points.length] ?? [x, y];
    doubled += x * nextY - nextX * y;
  });
  return Math.abs(doubled) / 2;
}

// Each pass starts from the previous result: a shape of thousands of corners shrinks fast.
function withinBudget(islands: TracedPoint[][]): TracedPoint[][] {
  let tolerance = START_TOLERANCE;
  let reduced = islands.map((island) => reducedLoop(island, tolerance));
  while (vertexTotal(reduced) > MAX_VERTICES) {
    tolerance *= TOLERANCE_GROWTH;
    reduced = reduced.map((island) => reducedLoop(island, tolerance));
  }
  return reduced;
}

function vertexTotal(islands: readonly TracedPoint[][]): number {
  return islands.reduce((total, island) => total + island.length, 0);
}

// Three anchors that are never dropped keep every island a polygon however tight the budget.
function reducedLoop(loop: readonly TracedPoint[], tolerance: number): TracedPoint[] {
  const closed = [...loop, ...loop.slice(0, 1)];
  const anchors = anchorsOf(closed);
  const kept = new Set(anchors);
  anchors.slice(1).forEach((to, at) => {
    markDeviating(closed, [anchors[at] ?? 0, to], tolerance, kept);
  });
  return loop.filter((_, at) => kept.has(at));
}

function anchorsOf(closed: readonly TracedPoint[]): number[] {
  const last = closed.length - 1;
  const opposite = farthestFrom(closed, [0, last]).at;
  const onOneSide = farthestFrom(closed, [0, opposite]);
  const onTheOther = farthestFrom(closed, [opposite, last]);
  const third = onOneSide.distance > onTheOther.distance ? onOneSide.at : onTheOther.at;
  return [0, opposite, third, last].sort((a, b) => a - b);
}

function markDeviating(
  points: readonly TracedPoint[],
  whole: Span,
  tolerance: number,
  kept: Set<number>,
): void {
  const pending: Span[] = [whole];
  for (let span = pending.pop(); span !== undefined; span = pending.pop()) {
    const { at, distance } = farthestFrom(points, span);
    if (distance <= tolerance) continue;
    kept.add(at);
    pending.push([span[0], at], [at, span[1]]);
  }
}

function farthestFrom(
  points: readonly TracedPoint[],
  [from, to]: Span,
): Readonly<{ at: number; distance: number }> {
  const start = points[from] ?? [0, 0];
  const end = points[to] ?? start;
  let farthest = { at: from, distance: 0 };
  for (let at = from + 1; at < to; at += 1) {
    const distance = distanceToLine(points[at] ?? start, start, end);
    if (distance > farthest.distance) farthest = { at, distance };
  }
  return farthest;
}

function distanceToLine(point: TracedPoint, start: TracedPoint, end: TracedPoint): number {
  const [deltaX, deltaY] = [end[0] - start[0], end[1] - start[1]];
  const length = Math.hypot(deltaX, deltaY);
  const [fromX, fromY] = [point[0] - start[0], point[1] - start[1]];
  if (length === 0) return Math.hypot(fromX, fromY);
  return Math.abs(deltaX * fromY - deltaY * fromX) / length;
}

// The art is drawn contained in the footprint, so the short side of the grid sits centred.
function inUnitSquare(
  island: readonly TracedPoint[],
  width: number,
  height: number,
): readonly TracedPoint[] {
  const side = Math.max(width, height);
  const [marginX, marginY] = [(side - width) / 2, (side - height) / 2];
  return island.map(([x, y]) => [unitOf(x + marginX, side), unitOf(y + marginY, side)]);
}

function unitOf(value: number, side: number): number {
  return Math.round((value / side) * PRECISION) / PRECISION;
}
