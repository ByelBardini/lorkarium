import type { TokenDto, TokenPatrolGaitDto, TokenPatrolRepeatDto } from '@lorkarium/contracts';
import { PATROL_POINTS_MAX, cell, sameCell, type Cell } from '@lorkarium/game-core';
import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { BoardCommandFailure, BoardScope } from '@/services/board-command-sender';
import type { TokenPatrolCommands } from '@/services/token-patrol-commands';

/** The route the master is drawing for one token, with the form beside it: the saved route when
 *  there is one, otherwise just `origin`, where the token stood when the editor opened. `path[0]`
 *  stays fixed; `saved` says it already had a patrol. */
export type PatrolDraft = Readonly<{
  scope: BoardScope;
  tokenId: string;
  tokenName: string;
  origin: Cell;
  path: readonly Cell[];
  repeat: TokenPatrolRepeatDto;
  speed: number;
  turns: boolean;
  gait: TokenPatrolGaitDto;
  saved: boolean;
}>;

export type TokenPatrolEditorState = Readonly<{
  /** `null`: the editor is closed. */
  draft: PatrolDraft | null;
  busy: boolean;
  /** Why the last save or removal was refused; the editor stays open. */
  failure: BoardCommandFailure | null;
}>;

/** Who the editor opens on: the grid, the token as it shows (a patrolling one where it walks
 *  now) and the status line of that grid. */
export type PatrolEditorTarget = Readonly<{
  scope: BoardScope;
  token: TokenDto;
  say: (notice: string) => void;
}>;

export type TokenPatrolEditor = TokenPatrolEditorState &
  Readonly<{
    open: (target: PatrolEditorTarget) => void;
    /** A click on the map: the next point (the same as the last adds nothing; past 32, the
     *  status line says so). */
    addPoint: (point: Cell) => void;
    /** Backspace: the last point goes, never the first. */
    removeLastPoint: () => void;
    /** "Redesenhar": the route starts over from the token's cell. */
    restart: () => void;
    setRepeat: (repeat: TokenPatrolRepeatDto) => void;
    setSpeed: (speed: number) => void;
    setTurns: (turns: boolean) => void;
    setGait: (gait: TokenPatrolGaitDto) => void;
    /** Enter or "Salvar": the route (two points at least) goes to the server; the ok closes. */
    save: () => Promise<void>;
    /** "Remover patrulha": the saved route is taken away; the ok closes. */
    remove: () => Promise<void>;
    /** Esc or "Cancelar": closed, nothing sent. */
    cancel: () => void;
  }>;

export type TokenPatrolEditorDeps = Readonly<{
  commands: Pick<TokenPatrolCommands, 'setTokenPatrol'>;
  /** What the status line says of the 33rd point. */
  fullNotice: string;
}>;

const CLOSED: TokenPatrolEditorState = { draft: null, busy: false, failure: null };

/** The master's patrol editor of one room visit: a draft drawn on the map from the token, saved
 *  by `token:setPatrol`. Nothing shows to the others until the server confirms.
 *
 *  Example: `const [patrolEditor] = useState(() => createTokenPatrolEditor({ commands, fullNotice }))` */
export function createTokenPatrolEditor(deps: TokenPatrolEditorDeps): StoreApi<TokenPatrolEditor> {
  return createStore<TokenPatrolEditor>()((set, get) => {
    let say: PatrolEditorTarget['say'] = () => undefined;
    const change = (fields: Partial<PatrolDraft>): void => {
      const { draft } = get();
      if (draft) set({ draft: { ...draft, ...fields }, failure: null });
    };
    const send = async (route: Parameters<TokenPatrolCommands['setTokenPatrol']>[2]) => {
      const { draft, busy } = get();
      if (!draft || busy) return;
      set({ busy: true, failure: null });
      const result = await deps.commands.setTokenPatrol(draft.scope, draft.tokenId, route);
      set(result.ok ? CLOSED : { busy: false, failure: result.failure });
    };
    return {
      ...CLOSED,
      open: (target) => {
        say = target.say;
        set({ ...CLOSED, draft: draftOf(target) });
      },
      addPoint: (point) => {
        const path = get().draft?.path;
        const last = path?.at(-1);
        if (!path || !last || sameCell(last, point)) return;
        if (path.length >= PATROL_POINTS_MAX) return say(deps.fullNotice);
        change({ path: [...path, point] });
      },
      removeLastPoint: () => {
        const path = get().draft?.path;
        if (path && path.length > 1) change({ path: path.slice(0, -1) });
      },
      restart: () => {
        const origin = get().draft?.origin;
        if (origin) change({ path: [origin] });
      },
      setRepeat: (repeat) => change({ repeat }),
      setSpeed: (speed) => change({ speed }),
      setTurns: (turns) => change({ turns }),
      setGait: (gait) => change({ gait }),
      save: () => {
        const draft = get().draft;
        if (!draft || !patrolDraftMoves(draft)) return Promise.resolve();
        const { path, repeat, speed, turns, gait } = draft;
        return send({ path, repeat, speed, turns, gait });
      },
      remove: () => send(null),
      cancel: () => set(CLOSED),
    };
  });
}

/** Whether the draft can be saved: some point leaves the token's first cell.
 *
 *  Example: `<Button disabled={!patrolDraftMoves(draft)}>Salvar</Button>` */
export function patrolDraftMoves(draft: Pick<PatrolDraft, 'path'>): boolean {
  const [first] = draft.path;
  return first !== undefined && draft.path.some((point) => !sameCell(point, first));
}

/** Whether "Redesenhar" has anything to throw away: the route is more than the token's cell.
 *
 *  Example: `{patrolDraftCanRestart(draft) && <Button onClick={restart}>Redesenhar</Button>}` */
export function patrolDraftCanRestart(draft: Pick<PatrolDraft, 'path' | 'origin'>): boolean {
  const [first] = draft.path;
  return draft.path.length > 1 || first === undefined || !sameCell(first, draft.origin);
}

/** React view of a slice of the patrol editor.
 *
 *  Example: `const draft = usePatrolEditor(editor, (state) => state.draft)` */
export function usePatrolEditor<T>(
  editor: StoreApi<TokenPatrolEditor>,
  selector: (state: TokenPatrolEditor) => T,
): T {
  return useStore(editor, selector);
}

// A saved patrol opens as it is, so changing only the speed is one click on "Salvar".
function draftOf({ scope, token }: PatrolEditorTarget): PatrolDraft {
  const saved = token.patrol;
  const origin = cell(token.col, token.row);
  return {
    scope,
    tokenId: token.id,
    tokenName: token.name,
    origin,
    path: saved ? saved.path.map(([col, row]) => cell(col, row)) : [origin],
    repeat: saved?.repeat ?? 'loop',
    speed: saved?.speed ?? 1,
    turns: saved?.turns ?? true,
    gait: saved?.gait ?? 'glide',
    saved: saved !== null,
  };
}
