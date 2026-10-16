import type { BarChangeDto } from '@lorkarium/contracts';
import type { Cell } from '@lorkarium/game-core';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { BoardIntent } from '@/renderer/board-renderer';
import type { RulerState } from '@/renderer/board-view';
import type {
  BoardCommandFailure,
  BoardCommandResult,
  TableBoardCommands,
} from '@/services/table-board-commands';

export type BoardTool = 'select' | 'ruler';

export const RULER_HINT = 'Arraste para medir.';

/** Where a token was asked to go, shown until the server answers. */
export type TokenPreview = Readonly<{ tokenId: string; col: number; row: number }>;

/** What only this viewer does on the board: tools, selection and the move waiting for the
 *  server. `notice` is the status line text (a tool hint, or why the server refused). */
export type BoardInteractionState = Readonly<{
  tool: BoardTool;
  localGridVisible: boolean;
  ruler: RulerState | null;
  measuring: boolean;
  notice: string | null;
  zoom: number;
  selectedTokenId: string | null;
  preview: TokenPreview | null;
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
    setReadOnly: (readOnly: boolean) => void;
    /** `announce` goes to the status line once the move is confirmed. */
    moveToken: (tokenId: string, to: Cell, announce?: string) => Promise<void>;
    adjustBar: (tokenId: string, barId: string, change: BarChangeDto) => Promise<void>;
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
}>;

type SetInteraction = StoreApi<BoardInteractionStore>['setState'];
type GetInteraction = StoreApi<BoardInteractionStore>['getState'];

const TOOL_HINT: Readonly<Record<BoardTool, string | null>> = { select: null, ruler: RULER_HINT };

/** The local side of the board for one room visit. Commands go to the server and the board
 *  only changes when its event arrives; a refused move puts the token back and says why.
 *
 *  Example: `const [interaction] = useState(() => createBoardInteractionStore({ campaignId, commands, describeRefusal }))` */
export function createBoardInteractionStore(
  deps: BoardInteractionDeps,
): StoreApi<BoardInteractionStore> {
  return createStore<BoardInteractionStore>()((set, get) => ({
    tool: 'select',
    localGridVisible: true,
    ruler: null,
    measuring: false,
    notice: null,
    zoom: 1,
    selectedTokenId: null,
    preview: null,
    readOnly: false,
    setTool: (tool) => set({ tool, ruler: null, measuring: false, notice: TOOL_HINT[tool] }),
    toggleLocalGrid: () => set({ localGridVisible: !get().localGridVisible }),
    pointer: (intent) => set(afterIntent(get(), intent)),
    escape: () =>
      set({ ruler: null, measuring: false, selectedTokenId: null, notice: TOOL_HINT[get().tool] }),
    say: (notice) => set({ notice }),
    select: (selectedTokenId) => set({ selectedTokenId }),
    setReadOnly: (readOnly) => set(readOnly ? { readOnly, preview: null } : { readOnly }),
    moveToken: (tokenId, to, announce) =>
      moveWithPreview(deps, { set, get }, { tokenId, to, announce }),
    adjustBar: async (tokenId, barId, change) => {
      if (get().readOnly) return;
      const result = await deps.commands.adjustBar(deps.campaignId, tokenId, barId, change);
      sayIfRefused(deps, set, result);
    },
    dropPreview: () => set({ preview: null }),
    command: async (send) => {
      if (get().readOnly) return false;
      const result = await send(deps.commands, deps.campaignId);
      sayIfRefused(deps, set, result);
      return result.ok;
    },
  }));
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
): Pick<
  BoardInteractionState,
  'localGridVisible' | 'ruler' | 'selectedTokenId' | 'preview' | 'readOnly' | 'tool'
> {
  return useStore(
    store,
    useShallow(({ localGridVisible, ruler, selectedTokenId, preview, readOnly, tool }) => ({
      localGridVisible,
      ruler,
      selectedTokenId,
      preview,
      readOnly,
      tool,
    })),
  );
}

type MoveRequest = Readonly<{ tokenId: string; to: Cell; announce: string | undefined }>;

async function moveWithPreview(
  deps: BoardInteractionDeps,
  { set, get }: Readonly<{ set: SetInteraction; get: GetInteraction }>,
  { tokenId, to, announce }: MoveRequest,
): Promise<void> {
  if (get().readOnly) return;
  const preview = { tokenId, col: to.col, row: to.row };
  set({ preview });
  const result = await deps.commands.moveToken(deps.campaignId, tokenId, to);
  // The confirmed token:moved arrives before its ack, so the board already shows the new cell.
  if (get().preview === preview) set({ preview: null });
  if (result.ok && announce) set({ notice: announce });
  sayIfRefused(deps, set, result);
}

function sayIfRefused(
  deps: BoardInteractionDeps,
  set: SetInteraction,
  result: BoardCommandResult,
): void {
  if (!result.ok) set({ notice: deps.describeRefusal(result.failure) });
}

function afterIntent(
  state: BoardInteractionState,
  intent: BoardIntent,
): Partial<BoardInteractionState> {
  if (intent.kind === 'cameraChanged') return { zoom: intent.zoom };
  if (intent.kind === 'tokenPicked') return { selectedTokenId: intent.tokenId };
  if (intent.kind === 'tokenDropped') return {};
  if (state.tool === 'select' && intent.kind === 'pointerDown') return { selectedTokenId: null };
  if (state.tool !== 'ruler' || !intent.cell) return {};
  if (intent.kind === 'pointerDown') {
    return { ruler: { from: intent.cell, to: intent.cell }, measuring: true };
  }
  if (!state.measuring || !state.ruler) return {};
  const ruler = { ...state.ruler, to: intent.cell };
  return { ruler, measuring: intent.kind === 'pointerMove' };
}
