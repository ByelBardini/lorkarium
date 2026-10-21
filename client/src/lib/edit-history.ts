import type {
  DrawingShapeInput,
  EffectAreaShapeDto,
  LightPlacementDto,
  NewTokenInput,
  WallKindDto,
  WallShapeDto,
} from '@lorkarium/contracts';
import type { Cell, TokenBox } from '@lorkarium/game-core';
import type { LightColor } from './light-color';

/** Undo stacks kept per user: how many actions go back. */
export const HISTORY_LIMIT = 50;

export type DrawingPosition = Readonly<{ x: number; y: number }>;
/** A move of a token; `path` is the bends it took around walls (absent: a straight move). */
export type TokenMove = Readonly<{
  tokenId: string;
  from: Cell;
  to: Cell;
  path?: readonly Cell[];
}>;
/** A turn of a token: the facing it had and the one it got. */
export type TokenTurn = Readonly<{ tokenId: string; from: number; to: number }>;
/** A resize of a token: the box it had and the one it got (the origin moves with a left/top handle). */
export type TokenResize = Readonly<{ tokenId: string; from: TokenBox; to: TokenBox }>;
export type DrawingMove = Readonly<{
  drawingId: string;
  from: DrawingPosition;
  to: DrawingPosition;
}>;
/** A token on the board as it was created: its id and everything needed to create it again. */
export type PlacedToken = Readonly<{ id: string; token: NewTokenInput }>;
/** A drawing on the board as it was created: its id and its shape, at its position. */
export type PlacedDrawing = Readonly<{ id: string; shape: DrawingShapeInput }>;

/** An area of effect on the board as it was created: its id and its whole shape. */
export type PlacedEffectArea = Readonly<{ id: string; shape: EffectAreaShapeDto }>;
/** A move, stretch or turn of an area: the shape it had and the one it got. */
export type EffectAreaReshape = Readonly<{
  effectAreaId: string;
  from: EffectAreaShapeDto;
  to: EffectAreaShapeDto;
}>;

/** A wall on the board as it was created: its id and its shape, at its position. */
export type DrawnWall = Readonly<{ id: string; shape: WallShapeDto }>;
/** A change of kind of a wall: the kind it had and the one it got. */
export type WallKindChange = Readonly<{ wallId: string; from: WallKindDto; to: WallKindDto }>;

/** A map light on the board as it was placed: its id, its point and its reach. */
export type PlacedLight = Readonly<{ id: string; placement: LightPlacementDto }>;
export type LightPoint = Readonly<{ x: number; y: number }>;
export type LightReach = Readonly<{ bright: number; dim: number }>;
/** A move of a map light: the point it had and the one it got. */
export type LightMove = Readonly<{ lightId: string; from: LightPoint; to: LightPoint }>;
/** A change of reach of a map light: the reach it had and the one it got. */
export type LightRangeChange = Readonly<{ lightId: string; from: LightReach; to: LightReach }>;
/** A change of color of a map light: the color it had and the one it got (`null` = neutral). */
export type LightColorChange = Readonly<{ lightId: string; from: LightColor; to: LightColor }>;
/** Where a map light points and how wide it opens, in degrees. */
export type LightCone = Readonly<{ facing: number; angle: number }>;
/** A change of cone of a map light (aimed or opened): the cone it had and the one it got. */
export type LightConeChange = Readonly<{ lightId: string; from: LightCone; to: LightCone }>;

/** One thing an action did, enough to redo it and to build its inverse. */
export type EditOp =
  | Readonly<{ kind: 'tokensMoved'; moves: readonly TokenMove[] }>
  | Readonly<{ kind: 'tokensFaced'; turns: readonly TokenTurn[] }>
  | Readonly<{ kind: 'tokensResized'; resizes: readonly TokenResize[] }>
  | Readonly<{ kind: 'drawingsMoved'; moves: readonly DrawingMove[] }>
  | Readonly<{ kind: 'tokensAdded'; tokens: readonly PlacedToken[] }>
  | Readonly<{ kind: 'tokensRemoved'; tokens: readonly PlacedToken[] }>
  | Readonly<{ kind: 'drawingsAdded'; drawings: readonly PlacedDrawing[] }>
  | Readonly<{ kind: 'drawingsRemoved'; drawings: readonly PlacedDrawing[] }>
  | Readonly<{ kind: 'effectAreasAdded'; effectAreas: readonly PlacedEffectArea[] }>
  | Readonly<{ kind: 'effectAreasRemoved'; effectAreas: readonly PlacedEffectArea[] }>
  | Readonly<{ kind: 'effectAreasReshaped'; reshapes: readonly EffectAreaReshape[] }>
  | Readonly<{ kind: 'wallsAdded'; walls: readonly DrawnWall[] }>
  | Readonly<{ kind: 'wallsRemoved'; walls: readonly DrawnWall[] }>
  | Readonly<{ kind: 'wallsKindChanged'; changes: readonly WallKindChange[] }>
  | Readonly<{ kind: 'lightsAdded'; lights: readonly PlacedLight[] }>
  | Readonly<{ kind: 'lightsRemoved'; lights: readonly PlacedLight[] }>
  | Readonly<{ kind: 'lightsMoved'; moves: readonly LightMove[] }>
  | Readonly<{ kind: 'lightRangesChanged'; changes: readonly LightRangeChange[] }>
  | Readonly<{ kind: 'lightColorsChanged'; changes: readonly LightColorChange[] }>
  | Readonly<{ kind: 'lightConesChanged'; changes: readonly LightConeChange[] }>;

/** One user action (a paste with tokens and drawings is one), in the order it was done. */
export type EditEntry = readonly EditOp[];

/** Old id → the id the server gave when it was created again. */
export type IdMapping = Readonly<Record<string, string>>;

export type EditHistory = Readonly<{ past: readonly EditEntry[]; future: readonly EditEntry[] }>;

export const EMPTY_HISTORY: EditHistory = { past: [], future: [] };

/** A new action on top of the undo stack (the oldest past the limit drops) and an empty redo.
 *
 *  Example: `history = record(history, [{ kind: 'tokensMoved', moves }])` */
export function record(history: EditHistory, entry: EditEntry): EditHistory {
  return { past: [...history.past, entry].slice(-HISTORY_LIMIT), future: [] };
}

/** What undoes the action: each op inverted, last first.
 *
 *  Example: `await run(inverseOf(history.past.at(-1)))` */
export function inverseOf(entry: EditEntry): EditEntry {
  return entry.toReversed().map(inverseOp);
}

/** The history once the top of the undo stack was undone on the server: it moves to the redo
 *  stack, and every entry left takes the ids that undoing created.
 *
 *  Example: `history = afterUndo(history, mapping)` */
export function afterUndo(history: EditHistory, mapping: IdMapping): EditHistory {
  const entry = history.past.at(-1);
  if (!entry) return history;
  return remapHistory(
    { past: history.past.slice(0, -1), future: [entry, ...history.future] },
    mapping,
  );
}

/** The history once the top of the redo stack was done again on the server.
 *
 *  Example: `history = afterRedo(history, mapping)` */
export function afterRedo(history: EditHistory, mapping: IdMapping): EditHistory {
  const [entry, ...rest] = history.future;
  if (!entry) return history;
  return remapHistory({ past: [...history.past, entry], future: rest }, mapping);
}

/** The history without the top of the undo stack: it can no longer be undone (STALE_UNDO). */
export function dropUndo(history: EditHistory): EditHistory {
  return { past: history.past.slice(0, -1), future: history.future };
}

/** The history without the top of the redo stack: it can no longer be redone. */
export function dropRedo(history: EditHistory): EditHistory {
  return { past: history.past, future: history.future.slice(1) };
}

/** The entry with every old id swapped for its new one.
 *
 *  Example: `remapEntry(entry, { [oldId]: newId })` */
export function remapEntry(entry: EditEntry, mapping: IdMapping): EditEntry {
  return entry.map((op) => remapOp(op, mapping));
}

function remapHistory(history: EditHistory, mapping: IdMapping): EditHistory {
  if (Object.keys(mapping).length === 0) return history;
  const remap = (entry: EditEntry): EditEntry => remapEntry(entry, mapping);
  return { past: history.past.map(remap), future: history.future.map(remap) };
}

function inverseOp(op: EditOp): EditOp {
  switch (op.kind) {
    case 'tokensMoved':
      return {
        kind: 'tokensMoved',
        moves: op.moves.map(({ tokenId, from, to, path }) => ({
          tokenId,
          from: to,
          to: from,
          ...(path && { path: path.toReversed() }),
        })),
      };
    case 'drawingsMoved':
      return {
        kind: 'drawingsMoved',
        moves: op.moves.map(({ drawingId, from, to }) => ({ drawingId, from: to, to: from })),
      };
    case 'tokensFaced':
      return {
        kind: 'tokensFaced',
        turns: op.turns.map(({ tokenId, from, to }) => ({ tokenId, from: to, to: from })),
      };
    case 'tokensResized':
      return {
        kind: 'tokensResized',
        resizes: op.resizes.map(({ tokenId, from, to }) => ({ tokenId, from: to, to: from })),
      };
    case 'tokensAdded':
      return { kind: 'tokensRemoved', tokens: op.tokens };
    case 'tokensRemoved':
      return { kind: 'tokensAdded', tokens: op.tokens };
    case 'drawingsAdded':
      return { kind: 'drawingsRemoved', drawings: op.drawings };
    case 'drawingsRemoved':
      return { kind: 'drawingsAdded', drawings: op.drawings };
    default:
      return inverseGroupOp(op);
  }
}

// Walls, lights and areas of effect each keep their own inverse.
function inverseGroupOp(op: WallOp | LightOp | EffectAreaOp): EditOp {
  if (isWallOp(op)) return inverseWallOp(op);
  if (isLightOp(op)) return inverseLightOp(op);
  return inverseEffectAreaOp(op);
}

/** The ops about map lights, run by `runLightOp`. */
export type LightOp = Extract<
  EditOp,
  {
    kind:
      | 'lightsAdded'
      | 'lightsRemoved'
      | 'lightsMoved'
      | 'lightRangesChanged'
      | 'lightColorsChanged'
      | 'lightConesChanged';
  }
>;

/** Whether the op is about map lights (the edit store hands those to `runLightOp`).
 *
 *  Example: `if (isLightOp(op)) return runLightOp(op, campaignId, commands)` */
export function isLightOp(op: EditOp): op is LightOp {
  return op.kind.startsWith('light');
}

function inverseLightOp(op: LightOp): EditOp {
  switch (op.kind) {
    case 'lightsAdded':
      return { kind: 'lightsRemoved', lights: op.lights };
    case 'lightsRemoved':
      return { kind: 'lightsAdded', lights: op.lights };
    case 'lightsMoved':
      return {
        kind: 'lightsMoved',
        moves: op.moves.map(({ lightId, from, to }) => ({ lightId, from: to, to: from })),
      };
    case 'lightRangesChanged':
      return {
        kind: 'lightRangesChanged',
        changes: op.changes.map(({ lightId, from, to }) => ({ lightId, from: to, to: from })),
      };
    case 'lightColorsChanged':
      return {
        kind: 'lightColorsChanged',
        changes: op.changes.map(({ lightId, from, to }) => ({ lightId, from: to, to: from })),
      };
    case 'lightConesChanged':
      return {
        kind: 'lightConesChanged',
        changes: op.changes.map(({ lightId, from, to }) => ({ lightId, from: to, to: from })),
      };
  }
}

type WallOp = Extract<EditOp, { kind: 'wallsAdded' | 'wallsRemoved' | 'wallsKindChanged' }>;

/** Whether the op is about walls (the edit store hands those to `runWallOp`).
 *
 *  Example: `if (isWallOp(op)) return runWallOp(op, campaignId, commands)` */
export function isWallOp(op: EditOp): op is WallOp {
  return op.kind === 'wallsAdded' || op.kind === 'wallsRemoved' || op.kind === 'wallsKindChanged';
}

function inverseWallOp(op: WallOp): EditOp {
  switch (op.kind) {
    case 'wallsAdded':
      return { kind: 'wallsRemoved', walls: op.walls };
    case 'wallsRemoved':
      return { kind: 'wallsAdded', walls: op.walls };
    case 'wallsKindChanged':
      return {
        kind: 'wallsKindChanged',
        changes: op.changes.map(({ wallId, from, to }) => ({ wallId, from: to, to: from })),
      };
  }
}

type EffectAreaOp = Extract<
  EditOp,
  { kind: 'effectAreasAdded' | 'effectAreasRemoved' | 'effectAreasReshaped' }
>;

function inverseEffectAreaOp(op: EffectAreaOp): EditOp {
  switch (op.kind) {
    case 'effectAreasAdded':
      return { kind: 'effectAreasRemoved', effectAreas: op.effectAreas };
    case 'effectAreasRemoved':
      return { kind: 'effectAreasAdded', effectAreas: op.effectAreas };
    case 'effectAreasReshaped':
      return {
        kind: 'effectAreasReshaped',
        reshapes: op.reshapes.map(({ effectAreaId, from, to }) => ({
          effectAreaId,
          from: to,
          to: from,
        })),
      };
  }
}

function remapOp(op: EditOp, mapping: IdMapping): EditOp {
  const idOf = (id: string): string => mapping[id] ?? id;
  switch (op.kind) {
    case 'tokensMoved':
      return { ...op, moves: op.moves.map((move) => ({ ...move, tokenId: idOf(move.tokenId) })) };
    case 'tokensFaced':
      return { ...op, turns: op.turns.map((turn) => ({ ...turn, tokenId: idOf(turn.tokenId) })) };
    case 'tokensResized':
      return {
        ...op,
        resizes: op.resizes.map((resize) => ({ ...resize, tokenId: idOf(resize.tokenId) })),
      };
    case 'drawingsMoved':
      return {
        ...op,
        moves: op.moves.map((move) => ({ ...move, drawingId: idOf(move.drawingId) })),
      };
    case 'tokensAdded':
    case 'tokensRemoved':
      return { ...op, tokens: op.tokens.map((placed) => ({ ...placed, id: idOf(placed.id) })) };
    case 'drawingsAdded':
    case 'drawingsRemoved':
      return { ...op, drawings: op.drawings.map((placed) => ({ ...placed, id: idOf(placed.id) })) };
    case 'effectAreasAdded':
    case 'effectAreasRemoved':
      return {
        ...op,
        effectAreas: op.effectAreas.map((placed) => ({ ...placed, id: idOf(placed.id) })),
      };
    case 'effectAreasReshaped':
      return {
        ...op,
        reshapes: op.reshapes.map((reshape) => ({
          ...reshape,
          effectAreaId: idOf(reshape.effectAreaId),
        })),
      };
    case 'lightsAdded':
    case 'lightsRemoved':
      return { ...op, lights: op.lights.map((placed) => ({ ...placed, id: idOf(placed.id) })) };
    case 'lightsMoved':
      return { ...op, moves: op.moves.map((move) => ({ ...move, lightId: idOf(move.lightId) })) };
    case 'lightRangesChanged':
      return {
        ...op,
        changes: op.changes.map((change) => ({ ...change, lightId: idOf(change.lightId) })),
      };
    case 'lightColorsChanged':
      return {
        ...op,
        changes: op.changes.map((change) => ({ ...change, lightId: idOf(change.lightId) })),
      };
    case 'lightConesChanged':
      return {
        ...op,
        changes: op.changes.map((change) => ({ ...change, lightId: idOf(change.lightId) })),
      };
    default:
      return remapWallOp(op, idOf);
  }
}

function remapWallOp(op: WallOp, idOf: (id: string) => string): EditOp {
  switch (op.kind) {
    case 'wallsAdded':
    case 'wallsRemoved':
      return { ...op, walls: op.walls.map((drawn) => ({ ...drawn, id: idOf(drawn.id) })) };
    case 'wallsKindChanged':
      return {
        ...op,
        changes: op.changes.map((change) => ({ ...change, wallId: idOf(change.wallId) })),
      };
  }
}
