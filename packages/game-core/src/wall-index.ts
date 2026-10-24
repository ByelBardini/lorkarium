import type { Vector2 } from './facing';
import { wallSegments, type Segment } from './wall-segments';
import { blocksMovement, blocksSight, type Wall } from './wall.vo';

// Buckets of 4 × 4 cells: a 100-cell scene is 625 of them, and a short leg visits one or two.
const BUCKET_CELLS = 4;
// A segment is filed in every bucket its box touches, this much wider: a point exactly on a
// bucket edge is found from either side.
const FILING_SLACK = 1e-6;
const HIT_TOLERANCE = 1e-9;
// Keys of a bucket: room for coordinates from −1024 to +3072 buckets, far beyond a scene.
const KEY_OFFSET = 1024;
const KEY_ROW = 4096;

/** Two sight-blocking segments that cross: the point and the indexes of both (the first lower). */
export type WallCrossing = Readonly<{ point: Vector2; first: number; second: number }>;

/** Segments filed by bucket, each with the index of the wall it belongs to. */
export class SegmentIndex {
  private readonly buckets = new Map<number, number[]>();
  private readonly stamps: Uint32Array;
  private stamp = 0;
  private readonly bounds: Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;

  constructor(
    readonly segments: readonly Segment[],
    readonly wallIndexes: readonly number[],
  ) {
    this.stamps = new Uint32Array(segments.length);
    segments.forEach((segment, index) => this.file(segment, index));
    this.bounds = boundsOf(segments);
  }

  /** The segments in the buckets a ray crosses from `origin` along `direction`, nearest bucket
   *  first, each once: `visit` answers the nearest hit so far (in units of `direction`), and the
   *  walk stops once no later bucket can hold a nearer one, or past `limit`.
   *
   *  Example: `index.nearestAlong(eye, ray, reach, (i) => hitAt(index.segments[i]))` */
  nearestAlong(
    origin: Vector2,
    direction: Vector2,
    limit: number,
    hitOf: (i: number) => number,
  ): number {
    let nearest = limit;
    const visit = (i: number): boolean => {
      nearest = Math.min(nearest, hitOf(i));
      return false;
    };
    const done = (exit: number): boolean => nearest <= exit;
    this.walk(origin, direction, Math.min(limit, this.leaveOf(origin, direction)), visit, done);
    return nearest;
  }

  /** The segment indexes of each bucket (a segment in several buckets is in each list). */
  bucketLists(): readonly (readonly number[])[] {
    return [...this.buckets.values()];
  }

  /** Visits every segment in the buckets the leg from `from` to `to` crosses, each once, until
   *  `visit` answers `true`; answers whether one did.
   *
   *  Example: `index.someAlong(a, b, (i) => legTouchesSegment({ from: a, to: b }, index.segments[i]))` */
  someAlong(from: Vector2, to: Vector2, visit: (i: number) => boolean): boolean {
    const direction = { x: to.x - from.x, y: to.y - from.y };
    let found = false;
    const stopAt = (i: number): boolean => (found = visit(i));
    this.walk(from, direction, Math.min(1, this.leaveOf(from, direction)), stopAt, () => false);
    return found;
  }

  private file(segment: Segment, index: number): void {
    const box = boxOf(segment);
    for (
      let bx = bucketOf(box.minX - FILING_SLACK);
      bx <= bucketOf(box.maxX + FILING_SLACK);
      bx++
    ) {
      for (
        let by = bucketOf(box.minY - FILING_SLACK);
        by <= bucketOf(box.maxY + FILING_SLACK);
        by++
      ) {
        const key = keyOf(bx, by);
        const filed = this.buckets.get(key);
        if (filed) filed.push(index);
        else this.buckets.set(key, [index]);
      }
    }
  }

  // Amanatides & Woo's grid walk, nearest bucket first: `visit` answers `true` to stop at once;
  // `done(exit)`, after each whole bucket, gets the ray parameter where it ends.
  private walk(
    origin: Vector2,
    direction: Vector2,
    limit: number,
    visit: (i: number) => boolean,
    done: (exit: number) => boolean,
  ): void {
    if (this.segments.length === 0 || limit < 0) return;
    this.stamp += 1;
    const x = axisWalk(origin.x, direction.x);
    const y = axisWalk(origin.y, direction.y);
    for (;;) {
      const exit = Math.min(x.next, y.next);
      if (this.visitBucket(keyOf(x.bucket, y.bucket), visit)) return;
      if (done(exit) || exit > limit) return;
      if (x.next < y.next) stepAxis(x);
      else stepAxis(y);
    }
  }

  private visitBucket(key: number, visit: (i: number) => boolean): boolean {
    for (const index of this.buckets.get(key) ?? []) {
      if (this.stamps[index] === this.stamp) continue;
      this.stamps[index] = this.stamp;
      if (visit(index)) return true;
    }
    return false;
  }

  // Past where the ray leaves the box of every segment there is nothing to hit.
  private leaveOf(origin: Vector2, direction: Vector2): number {
    const { minX, minY, maxX, maxY } = this.bounds;
    const x = slabExit(origin.x, direction.x, minX, maxX);
    const y = slabExit(origin.y, direction.y, minY, maxY);
    return Math.min(x, y);
  }
}

/** The walls of a scene ready for sight and passage: the segments of the walls that block sight
 *  and of those that block movement, filed by bucket, and (worked out on first use) where the
 *  sight-blocking ones cross. Prepared once per array (`preparedWalls`). */
export class PreparedWalls {
  readonly sight: SegmentIndex;
  readonly movement: SegmentIndex;
  private crossingList: readonly WallCrossing[] | null = null;

  constructor(readonly walls: readonly Wall[]) {
    this.sight = indexOfWalls(walls, blocksSight);
    this.movement = indexOfWalls(walls, blocksMovement);
  }

  /** Every pair of sight-blocking segments that cross strictly inside both, the point measured
   *  along the one with the lower index. */
  crossings(): readonly WallCrossing[] {
    this.crossingList ??= crossingsOf(this.sight);
    return this.crossingList;
  }
}

const prepared = new WeakMap<readonly Wall[], PreparedWalls>();

/** The walls prepared once per array (by identity): the same array gives back the same
 *  preparation, so sight, light and passage over the same walls share it.
 *
 *  Example: `preparedWalls(walls).sight.someAlong(eye, target, touches)` */
export function preparedWalls(walls: readonly Wall[]): PreparedWalls {
  const known = prepared.get(walls);
  if (known) return known;
  const fresh = new PreparedWalls(walls);
  prepared.set(walls, fresh);
  return fresh;
}

/** Where two segments cross strictly inside both, measured along `a`; `null` otherwise
 *  (parallel, touching only at an end, or apart).
 *
 *  Example: `crossingPoint(fromXto, fromYto)` → `{ x: 12, y: 6 }` */
export function crossingPoint(a: Segment, b: Segment): Vector2 | null {
  const r = { x: a.to.x - a.from.x, y: a.to.y - a.from.y };
  const s = { x: b.to.x - b.from.x, y: b.to.y - b.from.y };
  const denominator = r.x * s.y - r.y * s.x;
  if (Math.abs(denominator) <= HIT_TOLERANCE) return null;
  const offset = { x: b.from.x - a.from.x, y: b.from.y - a.from.y };
  const t = (offset.x * s.y - offset.y * s.x) / denominator;
  const u = (offset.x * r.y - offset.y * r.x) / denominator;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { x: a.from.x + t * r.x, y: a.from.y + t * r.y };
}

function indexOfWalls(walls: readonly Wall[], keeps: (value: Wall) => boolean): SegmentIndex {
  const segments: Segment[] = [];
  const wallIndexes: number[] = [];
  walls.forEach((value, wallIndex) => {
    if (!keeps(value)) return;
    for (const segment of wallSegments(value)) {
      segments.push(segment);
      wallIndexes.push(wallIndex);
    }
  });
  return new SegmentIndex(segments, wallIndexes);
}

// Two segments that cross share the bucket of their crossing, so only pairs of one bucket are
// tried; a pair met in several buckets is tried once.
function crossingsOf(index: SegmentIndex): WallCrossing[] {
  const crossings: WallCrossing[] = [];
  const tried = new Set<number>();
  const count = index.segments.length;
  for (const filed of index.bucketLists()) {
    for (let i = 0; i < filed.length; i += 1) {
      for (let j = i + 1; j < filed.length; j += 1) {
        const first = Math.min(filed[i] ?? 0, filed[j] ?? 0);
        const second = Math.max(filed[i] ?? 0, filed[j] ?? 0);
        if (tried.has(first * count + second)) continue;
        tried.add(first * count + second);
        const point = crossingOfPair(index, first, second);
        if (point) crossings.push({ point, first, second });
      }
    }
  }
  return crossings;
}

function crossingOfPair(index: SegmentIndex, first: number, second: number): Vector2 | null {
  const a = index.segments[first];
  const b = index.segments[second];
  return a && b ? crossingPoint(a, b) : null;
}

type AxisWalk = { bucket: number; step: number; next: number; delta: number };

function axisWalk(origin: number, direction: number): AxisWalk {
  const bucket = bucketOf(origin);
  if (direction === 0) return { bucket, step: 0, next: Infinity, delta: Infinity };
  const step = direction > 0 ? 1 : -1;
  const edge = (bucket + (step > 0 ? 1 : 0)) * BUCKET_CELLS;
  return {
    bucket,
    step,
    next: (edge - origin) / direction,
    delta: BUCKET_CELLS / Math.abs(direction),
  };
}

function stepAxis(axis: AxisWalk): void {
  axis.bucket += axis.step;
  axis.next += axis.delta;
}

function slabExit(origin: number, direction: number, min: number, max: number): number {
  if (direction === 0) return origin >= min && origin <= max ? Infinity : -1;
  const far = direction > 0 ? max : min;
  return (far - origin) / direction + FILING_SLACK;
}

type Box = Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;

function boxOf({ from, to }: Segment): Box {
  return {
    minX: Math.min(from.x, to.x),
    minY: Math.min(from.y, to.y),
    maxX: Math.max(from.x, to.x),
    maxY: Math.max(from.y, to.y),
  };
}

function boundsOf(segments: readonly Segment[]): Box {
  let box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const segment of segments) {
    const own = boxOf(segment);
    box = {
      minX: Math.min(box.minX, own.minX),
      minY: Math.min(box.minY, own.minY),
      maxX: Math.max(box.maxX, own.maxX),
      maxY: Math.max(box.maxY, own.maxY),
    };
  }
  return box;
}

function bucketOf(coordinate: number): number {
  return Math.floor(coordinate / BUCKET_CELLS);
}

function keyOf(bx: number, by: number): number {
  return (bx + KEY_OFFSET) * KEY_ROW + (by + KEY_OFFSET);
}
