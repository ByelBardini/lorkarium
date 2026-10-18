import type { Cell, SceneSize } from '@lorkarium/game-core';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  EMPTY_HISTORY,
  afterRedo,
  afterUndo,
  dropUndo,
  inverseOf,
  record,
  remapEntry,
  type EditEntry,
  type EditHistory,
  type EditOp,
  type IdMapping,
} from '@/lib/edit-history';
import { pastePlacement, type CopiedSelection } from '@/lib/paste-placement';
import type {
  BoardCommandFailure,
  BoardCommandResult,
  TableBoardCommands,
} from '@/services/table-board-commands';

/** Who edits and how: the commands of the table, whether they may create tokens (the master),
 *  and whether the table is read only right now (nothing is sent then). */
export type EditContext = Readonly<{
  campaignId: string;
  commands: TableBoardCommands;
  isMaster: boolean;
  readOnly: boolean;
}>;

export type EditOutcome =
  | Readonly<{ kind: 'done' }>
  | Readonly<{ kind: 'nothing' }>
  | Readonly<{ kind: 'out_of_scene' }>
  | Readonly<{ kind: 'refused'; failure: BoardCommandFailure }>;

/** `skippedTokens`: a player pasted a selection with tokens, so only the drawings went. */
export type PasteOutcome = Readonly<{ outcome: EditOutcome; skippedTokens: boolean }>;

export type PasteTarget = Readonly<{ cursor: Cell | null; scene: SceneSize }>;

export type TableEditState = Readonly<{
  campaignId: string;
  /** What Ctrl+C kept for this table, in the memory of the tab. */
  copied: CopiedSelection | null;
  /** This user's undo and redo stacks for this table, lost on F5. */
  history: EditHistory;
  /** An undo, redo or paste on its way: the next waits for it. */
  running: boolean;
}>;

export type TableEditStore = TableEditState &
  Readonly<{
    record: (entry: EditEntry) => void;
    copy: (selection: CopiedSelection) => void;
    paste: (context: EditContext, target: PasteTarget) => Promise<PasteOutcome>;
    undo: (context: EditContext) => Promise<EditOutcome>;
    redo: (context: EditContext) => Promise<EditOutcome>;
  }>;

type RunOutcome =
  | Readonly<{ kind: 'done'; mapping: IdMapping; done: EditEntry }>
  | Readonly<{ kind: 'refused'; failure: BoardCommandFailure; done: EditEntry }>;

const NOTHING: EditOutcome = { kind: 'nothing' };

/** The copy area and the undo stack of one open table, for this user only (created by the open
 *  tables store beside the board). Undoing sends the inverse with the expected state as its
 *  precondition, so the server refuses (`stale_undo`) when someone else changed it after.
 *
 *  Example: `await edits.getState().undo({ campaignId, commands, isMaster, readOnly })` */
export function createTableEditStore(campaignId: string): StoreApi<TableEditStore> {
  return createStore<TableEditStore>()((set, get) => {
    const exclusive = async <T>(idle: T, work: () => Promise<T>): Promise<T> => {
      if (get().running) return idle;
      set({ running: true });
      try {
        return await work();
      } finally {
        set({ running: false });
      }
    };
    return {
      campaignId,
      copied: null,
      history: EMPTY_HISTORY,
      running: false,
      record: (entry) => set({ history: record(get().history, entry) }),
      copy: (copied) => set({ copied }),
      paste: (context, target) =>
        exclusive({ outcome: NOTHING, skippedTokens: false }, () =>
          pasteNow(get, set, context, target),
        ),
      undo: (context) => exclusive(NOTHING, () => undoNow(get, set, context)),
      redo: (context) => exclusive(NOTHING, () => redoNow(get, set, context)),
    };
  });
}

/** React view of a slice of the edit store.
 *
 *  Example: `const canUndo = useTableEdits(edits, (state) => state.history.past.length > 0)` */
export function useTableEdits<T>(
  store: StoreApi<TableEditStore>,
  selector: (state: TableEditStore) => T,
): T {
  return useStore(store, selector);
}

type GetEdits = StoreApi<TableEditStore>['getState'];
type SetEdits = StoreApi<TableEditStore>['setState'];

async function undoNow(get: GetEdits, set: SetEdits, context: EditContext): Promise<EditOutcome> {
  const entry = get().history.past.at(-1);
  if (!entry || context.readOnly) return NOTHING;
  const run = await runEntry(inverseOf(entry), context);
  if (run.kind === 'done') {
    set({ history: afterUndo(get().history, run.mapping) });
    return { kind: 'done' };
  }
  if (run.failure === 'stale_undo') set({ history: dropUndo(get().history) });
  return { kind: 'refused', failure: run.failure };
}

async function redoNow(get: GetEdits, set: SetEdits, context: EditContext): Promise<EditOutcome> {
  const entry = get().history.future[0];
  if (!entry || context.readOnly) return NOTHING;
  const run = await runEntry(entry, context);
  if (run.kind !== 'done') return { kind: 'refused', failure: run.failure };
  set({ history: afterRedo(get().history, run.mapping) });
  return { kind: 'done' };
}

async function pasteNow(
  get: GetEdits,
  set: SetEdits,
  context: EditContext,
  target: PasteTarget,
): Promise<PasteOutcome> {
  const { copied } = get();
  if (!copied || context.readOnly) return { outcome: NOTHING, skippedTokens: false };
  const skippedTokens = !context.isMaster && copied.tokens.length > 0;
  const allowed = skippedTokens ? { ...copied, tokens: [] } : copied;
  if (allowed.tokens.length === 0 && allowed.drawings.length === 0) {
    return { outcome: NOTHING, skippedTokens };
  }
  const placed = pastePlacement(allowed, target.cursor, target.scene);
  if (!placed) return { outcome: { kind: 'out_of_scene' }, skippedTokens };
  const run = await runEntry(pasteOps(placed), context);
  if (run.done.length > 0)
    set({ history: record(get().history, remapEntry(run.done, idsOf(run))) });
  const outcome: EditOutcome =
    run.kind === 'done' ? { kind: 'done' } : { kind: 'refused', failure: run.failure };
  return { outcome, skippedTokens };
}

// The pasted items get their ids from the server: until then each one stands by its index.
function pasteOps(placed: CopiedSelection): EditEntry {
  const ops: EditOp[] = [];
  if (placed.tokens.length > 0) {
    const tokens = placed.tokens.map((token, index) => ({ id: `token:${index}`, token }));
    ops.push({ kind: 'tokensAdded', tokens });
  }
  if (placed.drawings.length > 0) {
    const drawings = placed.drawings.map((shape, index) => ({ id: `drawing:${index}`, shape }));
    ops.push({ kind: 'drawingsAdded', drawings });
  }
  return ops;
}

function idsOf(run: RunOutcome): IdMapping {
  return run.kind === 'done' ? run.mapping : {};
}

// One command per op, in order, each with the ids the ones before it created; stops at the
// first refusal (`done` keeps what went through, remapped).
async function runEntry(entry: EditEntry, context: EditContext): Promise<RunOutcome> {
  let mapping: IdMapping = {};
  const done: EditOp[] = [];
  for (const original of entry) {
    const [op] = remapEntry([original], mapping);
    if (!op) continue;
    const result = await runOp(op, context);
    if (!result.ok) return { kind: 'refused', failure: result.failure, done };
    mapping = { ...mapping, ...result.mapping };
    done.push(original);
  }
  return { kind: 'done', mapping, done };
}

type OpResult =
  | Readonly<{ ok: true; mapping: IdMapping }>
  | Readonly<{ ok: false; failure: BoardCommandFailure }>;

async function runOp(op: EditOp, { campaignId, commands }: EditContext): Promise<OpResult> {
  switch (op.kind) {
    case 'tokensMoved': {
      const moves = op.moves.map(({ tokenId, from, to }) => ({
        tokenId,
        ...cellOf(to),
        expect: cellOf(from),
      }));
      return created(await commands.moveTokens(campaignId, moves), []);
    }
    case 'tokensFaced': {
      const faces = op.turns.map(({ tokenId, from, to }) => ({
        tokenId,
        facing: to,
        expect: { facing: from },
      }));
      return created(await commands.faceTokens(campaignId, faces), []);
    }
    case 'drawingsMoved': {
      const moves = op.moves.map(({ drawingId, from, to }) => ({
        drawingId,
        x: to.x,
        y: to.y,
        expect: from,
      }));
      return created(await commands.moveDrawings(campaignId, moves), []);
    }
    case 'tokensAdded': {
      const result = await commands.createTokens(
        campaignId,
        op.tokens.map(({ token }) => token),
      );
      return created(
        result,
        op.tokens.map(({ id }) => id),
      );
    }
    case 'tokensRemoved': {
      const expect = op.tokens.map(({ id, token }) => ({
        tokenId: id,
        col: token.col,
        row: token.row,
      }));
      return created(
        await commands.deleteTokens(
          campaignId,
          op.tokens.map(({ id }) => id),
          expect,
        ),
        [],
      );
    }
    case 'drawingsAdded': {
      const result = await commands.createDrawings(
        campaignId,
        op.drawings.map(({ shape }) => shape),
      );
      return created(
        result,
        op.drawings.map(({ id }) => id),
      );
    }
    case 'drawingsRemoved': {
      const expect = op.drawings.map(({ id, shape }) => ({
        drawingId: id,
        x: shape.x,
        y: shape.y,
      }));
      const ids = op.drawings.map(({ id }) => id);
      return created(await commands.deleteDrawings(campaignId, ids, expect), []);
    }
  }
}

// The old ids, in the order sent, pair with the ids the server answered.
function created(result: BoardCommandResult, oldIds: readonly string[]): OpResult {
  if (!result.ok) return { ok: false, failure: result.failure };
  const newIds = result.createdIds ?? [];
  const mapping = Object.fromEntries(
    oldIds.flatMap((id, index) => {
      const newId = newIds[index];
      return newId ? [[id, newId] as const] : [];
    }),
  );
  return { ok: true, mapping };
}

function cellOf(at: Cell): Cell {
  return { col: at.col, row: at.row };
}
