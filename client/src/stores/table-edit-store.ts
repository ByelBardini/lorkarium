import type { Cell, SceneSize } from '@lorkarium/game-core';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  EMPTY_HISTORY,
  afterRedo,
  afterUndo,
  dropRedo,
  dropUndo,
  inverseOf,
  record,
  remapEntry,
  type EditEntry,
  type EditHistory,
  type EditOp,
  type IdMapping,
  isLightOp,
  isWallOp,
} from '@/lib/edit-history';
import { runLightOp } from './light-edit-ops';
import { runWallOp } from './wall-edit-ops';
import { pastePlacement, type CopiedSelection } from '@/lib/paste-placement';
import {
  createdIdsOf,
  isEffectAreaOp,
  runEffectAreaOp,
  type EditOpResult,
} from './effect-area-edit-ops';
import type {
  BoardCommandFailure,
  BoardScope,
  TableBoardCommands,
} from '@/services/table-board-commands';

/** What this user may do with tokens right now: the game-core rule over the room's keys
 *  (`viewerTokenRightsOf`), asked per token id since the undo stack keeps only ids. */
export type EditTokenRights = Readonly<{
  canCreate: boolean;
  canDelete: (tokenId: string) => boolean;
}>;

/** Who edits and how: the commands of the table, what they may do with tokens, and whether the
 *  table is read only right now (nothing is sent then). */
export type EditContext = Readonly<{
  scope: BoardScope;
  commands: TableBoardCommands;
  tokenRights: EditTokenRights;
  readOnly: boolean;
}>;

export type EditOutcome =
  | Readonly<{ kind: 'done' }>
  | Readonly<{ kind: 'nothing' }>
  /** The step needs a token key this user lacks now: it left the stack, nothing was sent. */
  | Readonly<{ kind: 'skipped' }>
  | Readonly<{ kind: 'out_of_scene' }>
  | Readonly<{ kind: 'refused'; failure: BoardCommandFailure }>;

/** `skippedTokens`: a player pasted a selection with tokens, so only the drawings and areas went. */
export type PasteOutcome = Readonly<{ outcome: EditOutcome; skippedTokens: boolean }>;

export type PasteTarget = Readonly<{ cursor: Cell | null; scene: SceneSize }>;

/** What Ctrl+C kept for one table, shared by all its grid tabs (copy on one, paste on another). */
export type CopyArea = Readonly<{
  copied: CopiedSelection | null;
  copy: (selection: CopiedSelection) => void;
}>;

export type TableEditState = Readonly<{
  campaignId: string;
  /** What Ctrl+C kept for this table, in the memory of the tab (the table's copy area). */
  copied: CopiedSelection | null;
  /** This user's undo and redo stacks for this grid tab, lost on F5. */
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
const SKIPPED: EditOutcome = { kind: 'skipped' };

/** The copy area of one open table, for this user only: every grid tab of it reads and fills it.
 *
 *  Example: `const copyArea = createCopyArea(); createTableEditStore(campaignId, copyArea)` */
export function createCopyArea(): StoreApi<CopyArea> {
  return createStore<CopyArea>()((set) => ({ copied: null, copy: (copied) => set({ copied }) }));
}

/** The undo stack of one grid tab over the copy area of its table, for this user only (created
 *  by the scene tabs store beside the board). Undoing sends the inverse with the expected state as
 *  its precondition, so the server refuses (`stale_undo`) when someone else changed it after.
 *
 *  Example: `await edits.getState().undo({ scope, commands, tokenRights, readOnly })` */
export function createTableEditStore(
  campaignId: string,
  copyArea: StoreApi<CopyArea> = createCopyArea(),
): StoreApi<TableEditStore> {
  return createStore<TableEditStore>()((set, get) => {
    copyArea.subscribe(({ copied }) => set({ copied }));
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
      copied: copyArea.getState().copied,
      history: EMPTY_HISTORY,
      running: false,
      record: (entry) => set({ history: record(get().history, entry) }),
      copy: (copied) => copyArea.getState().copy(copied),
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
  const inverse = inverseOf(entry);
  if (!canRunEditEntry(inverse, context.tokenRights)) {
    set({ history: dropUndo(get().history) });
    return SKIPPED;
  }
  const run = await runEntry(inverse, context);
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
  if (!canRunEditEntry(entry, context.tokenRights)) {
    set({ history: dropRedo(get().history) });
    return SKIPPED;
  }
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
  const skippedTokens = !context.tokenRights.canCreate && copied.tokens.length > 0;
  const allowed = skippedTokens ? { ...copied, tokens: [] } : copied;
  if (allowed.tokens.length + allowed.drawings.length + allowed.effectAreas.length === 0) {
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

// Undoing a creation is a deletion, redoing one a creation: each follows its token key, so the
// stack never opens a way around the room's keys.
function canRunEditEntry(entry: EditEntry, rights: EditTokenRights): boolean {
  return entry.every((op) => {
    if (op.kind === 'tokensAdded') return rights.canCreate;
    if (op.kind === 'tokensRemoved') return op.tokens.every(({ id }) => rights.canDelete(id));
    return true;
  });
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
  if (placed.effectAreas.length > 0) {
    const effectAreas = placed.effectAreas.map((shape, index) => ({
      id: `effect-area:${index}`,
      shape,
    }));
    ops.push({ kind: 'effectAreasAdded', effectAreas });
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

type OpResult = EditOpResult;

async function runOp(op: EditOp, { scope, commands }: EditContext): Promise<OpResult> {
  if (isEffectAreaOp(op)) return runEffectAreaOp(op, scope, commands);
  if (isWallOp(op)) return runWallOp(op, scope, commands);
  if (isLightOp(op)) return runLightOp(op, scope, commands);
  switch (op.kind) {
    case 'tokensMoved': {
      const moves = op.moves.map(({ tokenId, from, to, path }) => ({
        tokenId,
        ...cellOf(to),
        expect: cellOf(from),
        ...(path && path.length > 0 && { path: path.map(cellOf) }),
      }));
      return createdIdsOf(await commands.moveTokens(scope, moves), []);
    }
    case 'tokensFaced': {
      const faces = op.turns.map(({ tokenId, from, to }) => ({
        tokenId,
        facing: to,
        expect: { facing: from },
      }));
      return createdIdsOf(await commands.faceTokens(scope, faces), []);
    }
    case 'tokensResized': {
      const resizes = op.resizes.map(({ tokenId, from, to }) => ({ tokenId, ...to, expect: from }));
      return createdIdsOf(await commands.resizeTokens(scope, resizes), []);
    }
    case 'tokensHidden':
      return createdIdsOf(await commands.setTokensHidden(scope, op.tokenIds, op.hidden), []);
    case 'drawingsMoved': {
      const moves = op.moves.map(({ drawingId, from, to }) => ({
        drawingId,
        x: to.x,
        y: to.y,
        expect: from,
      }));
      return createdIdsOf(await commands.moveDrawings(scope, moves), []);
    }
    case 'tokensAdded': {
      const result = await commands.createTokens(
        scope,
        op.tokens.map(({ token }) => token),
      );
      return createdIdsOf(
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
      return createdIdsOf(
        await commands.deleteTokens(
          scope,
          op.tokens.map(({ id }) => id),
          expect,
        ),
        [],
      );
    }
    case 'drawingsAdded': {
      const result = await commands.createDrawings(
        scope,
        op.drawings.map(({ shape }) => shape),
      );
      return createdIdsOf(
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
      return createdIdsOf(await commands.deleteDrawings(scope, ids, expect), []);
    }
  }
}

function cellOf(at: Cell): Cell {
  return { col: at.col, row: at.row };
}
