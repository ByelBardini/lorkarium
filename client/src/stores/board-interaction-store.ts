import type {
  BarChangeDto,
  EffectAreaDto,
  EffectAreaShapeDto,
  TokenLayerDto,
} from '@lorkarium/contracts';
import type { Cell, SceneSize, TokenBox, Wall } from '@lorkarium/game-core';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { EditEntry, EffectAreaReshape, TokenResize, TokenTurn } from '@/lib/edit-history';
import type { LightColor } from '@/lib/light-color';
import type { InteractionClock } from '@/lib/interaction-clock';
import type { GroupMember, GroupPlacement } from '@/lib/token-group';
import type { TokenRoute } from '@/lib/token-route';
import type { BoardIntent } from '@/renderer/board-renderer';
import type { RulerState } from '@/renderer/board-view';
import type { DrawingPreview } from '@/renderer/drawing-view';
import type { WallMode } from '@/renderer/wall-view';
import type { WallEraseBox } from '@/services/wall-commands';
import type { LightPoint, LightReach } from '@/services/light-commands';
import type {
  BoardCommandFailure,
  BoardCommandResult,
  TableBoardCommands,
} from '@/services/table-board-commands';
import type {
  DoorStateDto,
  DrawingDto,
  LightDto,
  SceneVisionDto,
  WallDto,
  WallKindDto,
} from '@lorkarium/contracts';
import type { DrawingStyle } from '@/lib/drawing-style';
import { deleteDrawingsOf, moveSelection, type SelectionMove } from './drawing-edit-flow';
import { sendSketch, type FinishedSketch } from './drawing-tool-flow';
import {
  deleteEffectAreasOf,
  previewEffectArea,
  reshapeEffectAreasOf,
} from './effect-area-edit-flow';
import { sendEffectArea } from './effect-area-tool-flow';
import { changeWallKindsOf, deleteWallsOf, eraseWallAreaOf, eraseWallOf } from './wall-edit-flow';
import { setDoorOf, toggleDoorOf } from './door-flow';
import { sendWall, type WallToolContext } from './wall-tool-flow';
import { sendLight } from './light-tool-flow';
import {
  changeLightColorsOf,
  changeLightRangesOf,
  deleteLightsOf,
  moveLightOf,
  previewLightOf,
} from './light-edit-flow';
import { aimLightOf, changeLightAnglesOf, previewLightAimOf } from './light-cone-flow';
import { setLightsLitOf } from './light-lit-flow';
import { afterIntent, joined, NO_SELECTION, toggled } from './board-pointer-intents';
import { hintOf, toolChangeOf, WALL_MODE_HINT, type BoardTool } from './board-tool-state';
import { TokenDragFlow } from './token-drag-flow';
import { faceTokensOf, previewFacing } from './token-facing-flow';
import { previewResize, resizeTokensOf } from './token-resize-flow';

/** Where a token was asked to go, shown until the server answers. */
export type TokenPreview = Readonly<{ tokenId: string; col: number; row: number }>;

/** What is picked up with the token under the pointer: the movable selection it is part of
 *  (or itself alone), where each one stands, the scene they must stay in, and the walls that bar
 *  them (absent: the master, who passes every wall). */
export type DragGroup = Readonly<{
  members: readonly GroupMember[];
  scene: SceneSize;
  walls?: readonly Wall[];
}>;

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
  /** Areas of effect in the selection, beside the tokens and drawings. */
  selectedEffectAreaIds: readonly string[];
  /** The master's walls picked with the walls tool. */
  selectedWallIds: readonly string[];
  /** The master's map lights picked with the lights tool. */
  selectedLightIds: readonly string[];
  /** Where lights are dragged here and not yet confirmed, by id. */
  lightPreview: Readonly<Record<string, LightPoint>>;
  /** Where the master aims a light with its handle, not yet confirmed, by id. */
  lightAimPreview: Readonly<Record<string, number>>;
  /** What a press does with the walls tool (it stays when the tool changes). */
  wallMode: WallMode;
  /** The shape areas get while moved or stretched here and not yet confirmed, by id. */
  effectAreaPreview: Readonly<Record<string, EffectAreaShapeDto>>;
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
  /** The master's "Ver como os selecionados": the board through the selected tokens' eyes. */
  sightPreview: boolean;
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
    /** The area tool released: one area of effect with this shape. */
    finishEffectArea: (shape: EffectAreaShapeDto) => Promise<void>;
    /** The walls tool released: one wall in `style`, glued to the walls already on `scene`. */
    finishWall: (
      sketch: FinishedSketch,
      board: Pick<WallToolContext, 'style' | 'walls' | 'scene'>,
    ) => Promise<void>;
    /** The lights tool clicked on the empty board: one light there with the remembered reach and
     *  color. */
    placeLight: (
      point: LightPoint,
      reach: LightReach,
      color: LightColor,
      angle: number,
    ) => Promise<void>;
    /** A light being dragged (`null`: let go without a move). */
    previewLight: (lightId: string, point: LightPoint | null) => void;
    /** A light dropped: one move, one undo entry. */
    moveLight: (light: LightDto, to: LightPoint) => Promise<void>;
    /** The panel with lights picked: one reach for all of them, one undo entry. */
    changeLightRanges: (lights: readonly LightDto[], reach: LightReach) => Promise<void>;
    /** The panel with lights picked: one color for all of them, one undo entry. */
    changeLightColors: (lights: readonly LightDto[], color: LightColor) => Promise<void>;
    /** The panel with lights picked: one opening for all of them, one undo entry. */
    changeLightAngles: (lights: readonly LightDto[], angle: number) => Promise<void>;
    /** The handle of a light being dragged (`null`: let go without aiming). */
    previewLightAim: (lightId: string, facing: number | null) => void;
    /** The handle of a light released: one aim, one undo entry. */
    aimLight: (light: LightDto, facing: number) => Promise<void>;
    /** Delete on the lights picked. */
    deleteLights: (lights: readonly LightDto[]) => Promise<void>;
    /** The master's menu or panel: light or put out, never on the undo stack. */
    setLightsLit: (lights: readonly LightDto[], lit: boolean) => Promise<void>;
    /** Dragged drawings (and the tokens selected with them) dropped where they go. */
    moveSelection: (move: SelectionMove) => Promise<void>;
    /** Delete / Backspace on the selected drawings. */
    deleteDrawings: (drawings: readonly DrawingDto[]) => Promise<void>;
    /** Delete / Backspace on the selected areas of effect. */
    deleteEffectAreas: (areas: readonly EffectAreaDto[]) => Promise<void>;
    /** The handles released on areas: one command, one entry on the undo stack. */
    reshapeEffectAreas: (
      reshapes: readonly EffectAreaReshape[],
      announce?: string,
    ) => Promise<void>;
    /** A handle being dragged on an area (`null`: let go without a change). */
    previewEffectArea: (effectAreaId: string, shape: EffectAreaShapeDto | null) => void;
    setWallMode: (mode: WallMode) => void;
    /** A click while erasing: the whole wall (`null`) or one piece of it, one undo entry. */
    eraseWall: (wall: WallDto, segmentIndex: number | null) => Promise<void>;
    /** The eraser box released: every wall under it cut at its edges, one undo entry. */
    eraseWallArea: (walls: readonly WallDto[], box: WallEraseBox) => Promise<void>;
    /** Delete / Backspace on the selected walls. */
    deleteWalls: (walls: readonly WallDto[]) => Promise<void>;
    /** The panel with walls selected: they all take the kind (only lines become doors). */
    changeWallKinds: (walls: readonly WallDto[], kind: WallKindDto) => Promise<void>;
    /** A click on a door: closed opens, open closes (a locked one only for the master). */
    toggleDoor: (door: WallDto) => Promise<void>;
    /** The master's door menu: open, close, lock or unlock. */
    setDoorState: (door: WallDto, state: DoorStateDto) => Promise<void>;
    /** The master's "Ver como os selecionados" on and off (a player cannot). */
    toggleSightPreview: () => void;
    /** The scene's vision changed: with `off` there is nothing to preview. */
    followVision: (mode: SceneVisionDto | undefined) => void;
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

const NO_PREVIEWS = {
  preview: [],
  drawingPreview: [],
  facingPreview: {},
  resizePreview: {},
  effectAreaPreview: {},
  lightPreview: {},
  lightAimPreview: {},
} as const;

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
      selectedEffectAreaIds: [],
      selectedWallIds: [],
      selectedLightIds: [],
      lightPreview: {},
      lightAimPreview: {},
      effectAreaPreview: {},
      wallMode: 'draw',
      activeLayer: 'tokens',
      canChooseLayer: false,
      preview: [],
      facingPreview: {},
      resizePreview: {},
      drawingPreview: [],
      drag: null,
      hoverCell: null,
      readOnly: false,
      sightPreview: false,
      setTool: (tool) => {
        const change = toolChangeOf(get(), tool);
        if (change) set(change);
      },
      toggleLocalGrid: () => set({ localGridVisible: !get().localGridVisible }),
      pointer: (intent) => set(afterIntent(get(), intent)),
      escape: () => {
        drags.cancel();
        const notice = hintOf(get().tool, get().wallMode);
        set({ ruler: null, measuring: false, ...NO_SELECTION, notice });
      },
      say: (notice) => set({ notice }),
      select: (tokenId) => set({ ...NO_SELECTION, selectedTokenIds: tokenId ? [tokenId] : [] }),
      toggleSelection: (tokenId) =>
        set({ selectedTokenIds: toggled(get().selectedTokenIds, tokenId) }),
      selectMany: (tokenIds, { additive }) =>
        set({ selectedTokenIds: joined(get().selectedTokenIds, tokenIds, additive) }),
      allowLayerChoice: (canChooseLayer) =>
        set(
          canChooseLayer
            ? { canChooseLayer }
            : { canChooseLayer, activeLayer: 'tokens', sightPreview: false },
        ),
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
        const previews = { ...NO_PREVIEWS };
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
      finishEffectArea: (shape) => {
        const say = (notice: string): void => set({ notice });
        const recordEdit = deps.recordEdit ?? (() => undefined);
        return sendEffectArea({ ...deps, recordEdit }, shape, { readOnly: get().readOnly, say });
      },
      finishWall: (sketch, board) => {
        const say = (notice: string): void => set({ notice });
        const recordEdit = deps.recordEdit ?? (() => undefined);
        const context = { ...board, readOnly: get().readOnly, say };
        return sendWall({ ...deps, recordEdit }, sketch, context);
      },
      placeLight: (point, reach, color, angle) => {
        const say = (notice: string): void => set({ notice });
        const recordEdit = deps.recordEdit ?? (() => undefined);
        const context = { reach, color, angle, readOnly: get().readOnly, say };
        return sendLight({ ...deps, recordEdit }, point, context);
      },
      previewLight: (lightId, point) => previewLightOf(store, lightId, point),
      moveLight: (light, to) => moveLightOf(deps, store, light, to),
      changeLightRanges: (lights, reach) => changeLightRangesOf(deps, store, lights, reach),
      changeLightColors: (lights, color) => changeLightColorsOf(deps, store, lights, color),
      changeLightAngles: (lights, angle) => changeLightAnglesOf(deps, store, lights, angle),
      previewLightAim: (lightId, facing) => previewLightAimOf(store, lightId, facing),
      aimLight: (light, facing) => aimLightOf(deps, store, light, facing),
      deleteLights: (lights) => deleteLightsOf(deps, store, lights),
      setLightsLit: (lights, lit) => setLightsLitOf(deps, store, lights, lit),
      toggleSightPreview: () => {
        if (!get().canChooseLayer) return;
        set({ sightPreview: !get().sightPreview });
      },
      followVision: (mode) => {
        if (mode === 'off' && get().sightPreview) set({ sightPreview: false });
      },
      toggleDoor: (door) => toggleDoorOf(deps, store, door),
      setDoorState: (door, state) => setDoorOf(deps, store, door, state),
      setWallMode: (wallMode) => {
        set({ wallMode, notice: WALL_MODE_HINT[wallMode], selectedWallIds: [] });
      },
      eraseWall: (wall, segmentIndex) => eraseWallOf(deps, store, wall, segmentIndex),
      eraseWallArea: (walls, box) => eraseWallAreaOf(deps, store, walls, box),
      deleteWalls: (walls) => deleteWallsOf(deps, store, walls),
      changeWallKinds: (walls, kind) => changeWallKindsOf(deps, store, walls, kind),
      moveSelection: (move) => moveSelection(deps, store, move),
      deleteDrawings: (drawings) => deleteDrawingsOf(deps, store, drawings),
      deleteEffectAreas: (areas) => deleteEffectAreasOf(deps, store, areas),
      reshapeEffectAreas: (reshapes, announce) =>
        reshapeEffectAreasOf(deps, store, reshapes, announce),
      previewEffectArea: (effectAreaId, shape) => previewEffectArea(store, effectAreaId, shape),
      dropPreview: () => set({ ...NO_PREVIEWS }),
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
      selectedEffectAreaIds: state.selectedEffectAreaIds,
      selectedWallIds: state.selectedWallIds,
      selectedLightIds: state.selectedLightIds,
      lightPreview: state.lightPreview,
      lightAimPreview: state.lightAimPreview,
      wallMode: state.wallMode,
      effectAreaPreview: state.effectAreaPreview,
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
  | 'selectedEffectAreaIds'
  | 'selectedWallIds'
  | 'selectedLightIds'
  | 'lightPreview'
  | 'lightAimPreview'
  | 'wallMode'
  | 'effectAreaPreview'
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

function sayIfRefused(
  deps: BoardInteractionDeps,
  set: SetInteraction,
  result: BoardCommandResult,
): void {
  if (!result.ok) set({ notice: deps.describeRefusal(result.failure) });
}
