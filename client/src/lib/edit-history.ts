import type { DrawingShapeInput, NewTokenInput } from '@lorkarium/contracts';
import type { Cell, TokenBox } from '@lorkarium/game-core';

/** Undo stacks kept per user: how many actions go back. */
export const HISTORY_LIMIT = 50;

export type DrawingPosition = Readonly<{ x: number; y: number }>;
export type TokenMove = Readonly<{ tokenId: string; from: Cell; to: Cell }>;
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

/** One thing an action did, enough to redo it and to build its inverse. */
export type EditOp =
  | Readonly<{ kind: 'tokensMoved'; moves: readonly TokenMove[] }>
  | Readonly<{ kind: 'tokensFaced'; turns: readonly TokenTurn[] }>
  | Readonly<{ kind: 'tokensResized'; resizes: readonly TokenResize[] }>
  | Readonly<{ kind: 'drawingsMoved'; moves: readonly DrawingMove[] }>
  | Readonly<{ kind: 'tokensAdded'; tokens: readonly PlacedToken[] }>
  | Readonly<{ kind: 'tokensRemoved'; tokens: readonly PlacedToken[] }>
  | Readonly<{ kind: 'drawingsAdded'; drawings: readonly PlacedDrawing[] }>
  | Readonly<{ kind: 'drawingsRemoved'; drawings: readonly PlacedDrawing[] }>;

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
        moves: op.moves.map(({ tokenId, from, to }) => ({ tokenId, from: to, to: from })),
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
  }
}
