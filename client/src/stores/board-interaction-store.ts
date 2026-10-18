import type { BarChangeDto, TokenLayerDto } from '@lorkarium/contracts';
import type { Cell, SceneSize, TokenBox } from '@lorkarium/game-core';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EditEntry, TokenResize, TokenTurn } from '@/lib/edit-history';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { GroupMember, GroupPlacement } from '@/lib/token-group';
import type { TokenRoute } from '@/lib/token-route';
import type { BoardIntent, BoardPointerIntent } from '@/renderer/board-renderer';
import type { RulerState } from '@/renderer/board-view';
import type { DrawingPreview } from '@/renderer/drawing-view';
import type {
  BoardCommandFailure,
  BoardCommandResult,
  TableBoardCommands,
} from '@/services/table-board-commands';
import type { DrawingDto } from '@lorkarium/contracts';
import type { DrawingStyle } from '@/lib/drawing-style';
import { deleteDrawingsOf, moveSelection, type SelectionMove } from './drawing-edit-flow';
import { sendSketch, type FinishedSketch } from './drawing-tool-flow';
import { TokenDragFlow } from './token-drag-flow';
import { faceTokensOf, previewFacing } from './token-facing-flow';
import { previewResize, resizeTokensOf } from './token-resize-flow';

export type BoardTool = 'select' | 'ruler' | 'draw';

export const RULER_HINT = 'Arraste para medir.';
export const DRAW_HINT = 'Arraste para desenhar; Shift encaixa a forma na grade.';

/** Where a token was asked to go, shown until the server answers. */
export type TokenPreview = Readonly<{ tokenId: string; col: number; row: number }>;

/** What is picked up with the token under the pointer: the movable selection it is part of
 *  (or itself alone), where each one stands, and the scene they must stay in. */
export type DragGroup = Readonly<{ members: readonly GroupMember[]; scene: SceneSize }>;

/** The group this viewer is dragging: the anchor (the token under the pointer) and the path it
 *  traced (the ruler), and where every member would land (`null`: one would leave the scene). */
export type TokenDrag = DragGroup &
  Readonly<{ anchorId: string; route: TokenRoute; landing: readonly GroupPlacement[] | null }>;

/** What only this viewer does on the board: tools, selection and the move waiting for the
 *  server. `notice` is the status line text (a tool hint, or why the server refused). */
export type BoardInteractionState = Readonly<{
  tool: BoardTool;
  localGridVisible: boolean;
  ruler: RulerState | null;
  measuring: boolean;
  notice: string | null;
  zoom: number;
  selectedTokenIds: readonly string[];
  /** Drawings in the selection, beside the tokens. */
  selectedDrawingIds: readonly string[];
  /** Only tokens on this layer are picked up; a player is always on `tokens`. */
  activeLayer: TokenLayerDto;
  canChooseLayer: boolean;
  /** The ghosts of the moves waiting for the server; empty with none. */
  preview: readonly TokenPreview[];
  /** Where tokens look while turned here and not yet confirmed, by id. */
  facingPreview: Readonly<Record<string, number>>;
  /** The box tokens get while resized here and not yet confirmed, by id. */
  resizePreview: Readonly<Record<string, TokenBox>>;
  /** Where drawings were asked to go, until the server answers. */
  drawingPreview: readonly DrawingPreview[];
  drag: TokenDrag | null;
  /** The cell under the pointer over the board (`null` off it): where a paste lands. */
  hoverCell: Cell | null;
  /** Reconnecting: there is no queue, so nothing is sent and nothing is dragged. */
  readOnly: boolean;
}>;

export type BoardInteractionStore = BoardInteractionState &
  Readonly<{
    setTool: (tool: BoardTool) => void;
    toggleLocalGrid: () => void;
    pointer: (intent: BoardIntent) => void;
    escape: () => void;
    say: (notice: string) => void;
    select: (tokenId: string | null) => void;
    /** Shift+click: adds the token, or takes it out when it is already selected. */
    toggleSelection: (tokenId: string) => void;
    /** The marquee: replaces the selection, or adds to it without repeating. */
    selectMany: (tokenIds: readonly string[], options: Readonly<{ additive: boolean }>) => void;
    /** Whether this viewer may change the active layer (the master); `false` goes back to `tokens`. */
    allowLayerChoice: (allowed: boolean) => void;
    /** Changing the layer drops the selection and the ruler of the layer left behind. */
    setActiveLayer: (layer: TokenLayerDto) => void;
    setTokensLayer: (tokenIds: readonly string[], layer: TokenLayerDto) => Promise<void>;
    setReadOnly: (readOnly: boolean) => void;
    /** `announce` goes to the status line once the move is confirmed. */
    moveToken: (tokenId: string, to: Cell, announce?: string) => Promise<void>;
    /** A group moved as one (the arrows), all or nothing, one entry on the undo stack. */
    moveTokens: (moves: readonly GroupPlacement[], announce?: string) => Promise<void>;
    /** The dragged token went over `over` (`null` off the scene): the route grows, its group
     *  follows, the others see it there, and standing still 2 s bends the ruler. */
    dragOver: (tokenId: string, origin: Cell, over: Cell | null, group: DragGroup) => void;
    /** Esc: the token goes back for everyone and nothing is moved. */
    cancelDrag: () => void;
    /** The release: a move, unless it fell off the scene or back on its own cell. */
    dropToken: (tokenId: string, to: Cell | null, announce?: string) => Promise<void>;
    adjustBar: (tokenId: string, barId: string, change: BarChangeDto) => Promise<void>;
    /** The handle or Q/E: one command for every turn, one entry on the undo stack. */
    faceTokens: (turns: readonly TokenTurn[], announce?: string) => Promise<void>;
    /** The handle being dragged (`null`: let go without a turn). */
    previewFacing: (tokenId: string, facing: number | null) => void;
    /** The handles: one command for every resize, one entry on the undo stack. */
    resizeTokens: (resizes: readonly TokenResize[], announce?: string) => Promise<void>;
    /** The handle being dragged (`null`: let go without a resize). */
    previewResize: (tokenId: string, box: TokenBox | null) => void;
    /** The draw tool released: one drawing on the active layer, in `style`. */
    finishSketch: (sketch: FinishedSketch, style: DrawingStyle) => Promise<void>;
    /** Dragged drawings (and the tokens selected with them) dropped where they go. */
    moveSelection: (move: SelectionMove) => Promise<void>;
    /** Delete / Backspace on the selected drawings. */
    deleteDrawings: (drawings: readonly DrawingDto[]) => Promise<void>;
    /** Sends any other board command; a refusal goes to the status line. Nothing is sent while
     *  read only. Answers whether it was confirmed. */
    command: (
      send: (commands: TableBoardCommands, campaignId: string) => Promise<BoardCommandResult>,
    ) => Promise<boolean>;
    dropPreview: () => void;
  }>;

export type BoardInteractionDeps = Readonly<{
  campaignId: string;
  commands: TableBoardCommands;
  /** The words for a refused token command, from the feature that owns the messages. */
  describeRefusal: (failure: BoardCommandFailure) => string;
  /** The browser's unless a test plays it. */
  clock?: InteractionClock;
  /** A confirmed move goes on this user's undo stack (none: nothing is recorded). */
  recordEdit?: (entry: EditEntry) => void;
  /** The confirmed cell of a token, to record where a move started from. */
  tokenCellOf?: (tokenId: string) => Cell | null;
}>;

type SetInteraction = StoreApi<BoardInteractionStore>['setState'];

const TOOL_HINT: Readonly<Record<BoardTool, string | null>> = {
  select: null,
  ruler: RULER_HINT,
  draw: DRAW_HINT,
};

const NO_SELECTION = { selectedTokenIds: [], selectedDrawingIds: [] } as const;

/** The local side of the board for one room visit. Commands go to the server and the board
 *  only changes when its event arrives; a refused move puts the token back and says why.
 *
 *  Example: `const [interaction] = useState(() => createBoardInteractionStore({ campaignId, commands, describeRefusal }))` */
export function createBoardInteractionStore(
  deps: BoardInteractionDeps,
): StoreApi<BoardInteractionStore> {
  return createStore<BoardInteractionStore>()((set, get) => {
    const store = { getState: get, setState: set };
    const drags = new TokenDragFlow(deps, store, (result) => sayIfRefused(deps, set, result));
    return {
      tool: 'select',
      localGridVisible: true,
      ruler: null,
      measuring: false,
      notice: null,
      zoom: 1,
      selectedTokenIds: [],
      selectedDrawingIds: [],
      activeLayer: 'tokens',
      canChooseLayer: false,
      preview: [],
      facingPreview: {},
      resizePreview: {},
      drawingPreview: [],
      drag: null,
      hoverCell: null,
      readOnly: false,
      setTool: (tool) => {
        const selection = tool === 'draw' ? NO_SELECTION : {};
        set({ tool, ruler: null, measuring: false, notice: TOOL_HINT[tool], ...selection });
      },
      toggleLocalGrid: () => set({ localGridVisible: !get().localGridVisible }),
      pointer: (intent) => set(afterIntent(get(), intent)),
      escape: () => {
        drags.cancel();
        const notice = TOOL_HINT[get().tool];
        set({ ruler: null, measuring: false, ...NO_SELECTION, notice });
      },
      say: (notice) => set({ notice }),
      select: (tokenId) =>
        set({ selectedTokenIds: tokenId ? [tokenId] : [], selectedDrawingIds: [] }),
      toggleSelection: (tokenId) =>
        set({ selectedTokenIds: toggled(get().selectedTokenIds, tokenId) }),
      selectMany: (tokenIds, { additive }) =>
        set({ selectedTokenIds: joined(get().selectedTokenIds, tokenIds, additive) }),
      allowLayerChoice: (canChooseLayer) =>
        set(canChooseLayer ? { canChooseLayer } : { canChooseLayer, activeLayer: 'tokens' }),
      setActiveLayer: (activeLayer) => {
        if (!get().canChooseLayer) return;
        set({ activeLayer, ...NO_SELECTION, ruler: null, measuring: false });
      },
      setTokensLayer: async (tokenIds, layer) => {
        if (get().readOnly) return;
        const result = await deps.commands.setTokenLayer(deps.campaignId, tokenIds, layer);
        sayIfRefused(deps, set, result);
      },
      setReadOnly: (readOnly) => {
        if (readOnly) drags.forget();
        const previews = { preview: [], drawingPreview: [], facingPreview: {}, resizePreview: {} };
        set(readOnly ? { readOnly, ...previews } : { readOnly });
      },
      moveToken: (tokenId, to, announce) => drags.move({ tokenId, to, announce }),
      moveTokens: (moves, announce) => drags.moveGroup(moves, announce),
      dragOver: (tokenId, origin, over, group) => drags.over(tokenId, origin, over, group),
      cancelDrag: () => drags.cancel(),
      dropToken: (tokenId, to, announce) => drags.drop({ tokenId, to, announce }),
      adjustBar: async (tokenId, barId, change) => {
        if (get().readOnly) return;
        const result = await deps.commands.adjustBar(deps.campaignId, tokenId, barId, change);
        sayIfRefused(deps, set, result);
      },
      faceTokens: (turns, announce) => faceTokensOf(deps, store, turns, announce),
      previewFacing: (tokenId, facing) => previewFacing(store, tokenId, facing),
      resizeTokens: (resizes, announce) => resizeTokensOf(deps, store, resizes, announce),
      previewResize: (tokenId, box) => previewResize(store, tokenId, box),
      finishSketch: (sketch, style) => {
        const { activeLayer: layer, readOnly } = get();
        const say = (notice: string): void => set({ notice });
        const recordEdit = deps.recordEdit ?? (() => undefined);
        return sendSketch({ ...deps, recordEdit }, sketch, { style, layer, readOnly, say });
      },
      moveSelection: (move) => moveSelection(deps, store, move),
      deleteDrawings: (drawings) => deleteDrawingsOf(deps, store, drawings),
      dropPreview: () =>
        set({ preview: [], drawingPreview: [], facingPreview: {}, resizePreview: {} }),
      command: async (send) => {
        if (get().readOnly) return false;
        const result = await send(deps.commands, deps.campaignId);
        sayIfRefused(deps, set, result);
        return result.ok;
      },
    };
  });
}

/** React view of a slice of the interaction store.
 *
 *  Example: `const tool = useBoardInteraction(store, (state) => state.tool)` */
export function useBoardInteraction<T>(
  store: StoreApi<BoardInteractionStore>,
  selector: (state: BoardInteractionStore) => T,
): T {
  return useStore(store, selector);
}

/** The local part of what the board draws, as one shallow-compared slice.
 *
 *  Example: `const local = useLocalBoardView(interaction); buildBoardView({ scene, tokens, ...local })` */
export function useLocalBoardView(
  store: StoreApi<BoardInteractionStore>,
): Pick<BoardInteractionState, LocalViewField> {
  return useStore(
    store,
    useShallow((state) => ({
      localGridVisible: state.localGridVisible,
      ruler: state.ruler,
      selectedTokenIds: state.selectedTokenIds,
      selectedDrawingIds: state.selectedDrawingIds,
      drawingPreview: state.drawingPreview,
      activeLayer: state.activeLayer,
      canChooseLayer: state.canChooseLayer,
      preview: state.preview,
      facingPreview: state.facingPreview,
      resizePreview: state.resizePreview,
      drag: state.drag,
      readOnly: state.readOnly,
      tool: state.tool,
    })),
  );
}

type LocalViewField =
  | 'localGridVisible'
  | 'ruler'
  | 'selectedTokenIds'
  | 'selectedDrawingIds'
  | 'drawingPreview'
  | 'activeLayer'
  | 'canChooseLayer'
  | 'preview'
  | 'facingPreview'
  | 'resizePreview'
  | 'drag'
  | 'readOnly'
  | 'tool';

/** The one selected token, or `null` with none or several: what the card and the keys use.
 *
 *  Example: `const openId = singleSelectedOf(useBoardInteraction(store, (s) => s.selectedTokenIds))` */
export function singleSelectedOf(selectedTokenIds: readonly string[]): string | null {
  return selectedTokenIds.length === 1 ? (selectedTokenIds[0] ?? null) : null;
}

function joined(
  current: readonly string[],
  tokenIds: readonly string[],
  additive: boolean,
): string[] {
  return [...new Set([...(additive ? current : []), ...tokenIds])];
}

function toggled(ids: readonly string[], tokenId: string): string[] {
  return ids.includes(tokenId) ? ids.filter((id) => id !== tokenId) : [...ids, tokenId];
}

function sayIfRefused(
  deps: BoardInteractionDeps,
  set: SetInteraction,
  result: BoardCommandResult,
): void {
  if (!result.ok) set({ notice: deps.describeRefusal(result.failure) });
}

// A plain click or marquee replaces the whole selection (tokens and drawings); Shift adds to it.
function selectionAfter(
  state: BoardInteractionState,
  intent: BoardIntent,
): Partial<BoardInteractionState> | null {
  const kept = (additive: boolean) => (additive ? {} : NO_SELECTION);
  switch (intent.kind) {
    case 'tokenPicked': {
      const { tokenId, additive } = intent;
      const tokens = additive ? toggled(state.selectedTokenIds, tokenId) : [tokenId];
      return { ...kept(additive), selectedTokenIds: tokens };
    }
    case 'drawingPicked': {
      const { drawingId, additive } = intent;
      const drawings = additive ? toggled(state.selectedDrawingIds, drawingId) : [drawingId];
      return { ...kept(additive), selectedDrawingIds: drawings };
    }
    case 'tokensMarqueed': {
      const tokens = joined(state.selectedTokenIds, intent.tokenIds, intent.additive);
      return { ...kept(intent.additive), selectedTokenIds: tokens };
    }
    // Always right after its tokensMarqueed, which already dropped the old drawings.
    case 'drawingsMarqueed':
      return { selectedDrawingIds: joined(state.selectedDrawingIds, intent.drawingIds, true) };
    default:
      return null;
  }
}

// A dragged or dropped token is routed to its own action by the board area, not here.
function isPointerIntent(intent: BoardIntent): intent is BoardPointerIntent {
  return (
    intent.kind === 'pointerDown' || intent.kind === 'pointerMove' || intent.kind === 'pointerUp'
  );
}

function afterIntent(
  state: BoardInteractionState,
  intent: BoardIntent,
): Partial<BoardInteractionState> {
  if (intent.kind === 'cameraChanged') return { zoom: intent.zoom };
  if (intent.kind === 'pointerHovered') return { hoverCell: intent.cell };
  const selection = selectionAfter(state, intent);
  if (selection) return selection;
  if (!isPointerIntent(intent)) return {};
  if (state.tool === 'select' && intent.kind === 'pointerDown') return NO_SELECTION;
  if (state.tool !== 'ruler' || !intent.cell) return {};
  if (intent.kind === 'pointerDown') {
    return { ruler: { from: intent.cell, to: intent.cell }, measuring: true };
  }
  if (!state.measuring || !state.ruler) return {};
  const ruler = { ...state.ruler, to: intent.cell };
  return { ruler, measuring: intent.kind === 'pointerMove' };
}
