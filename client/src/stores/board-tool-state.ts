import type { TokenLayerDto } from '@lorkarium/contracts';
import type { DrawMode } from '@/renderer/drawing-view';
import type { WallMode } from '@/renderer/wall-view';
import { NO_SELECTION } from './board-pointer-intents';

export type BoardTool = 'select' | 'ruler' | 'draw' | 'area' | 'walls' | 'lights' | 'conditions';
export type { DrawMode, WallMode };

export const RULER_HINT = 'Arraste para medir.';
export const DRAW_HINT = 'Arraste para desenhar; Shift encaixa a forma na grade.';
export const AREA_HINT = 'Arraste a partir de onde a magia nasce; Shift encaixa a forma perfeita.';
export const WALL_HINT = 'Arraste para criar a parede; Shift encaixa na grade.';
export const LIGHT_HINT = 'Clique para pôr uma luz; Shift encaixa na meia casa.';
/** The condition tool before a condition is picked; `conditionToolHintOf` says the picked one. */
export const CONDITION_HINT = 'Escolha uma condição no painel.';

/** What the status line says while the walls tool is in each mode. */
export const WALL_MODE_HINT: Readonly<Record<WallMode, string>> = {
  draw: WALL_HINT,
  eraseArea: 'Arraste uma caixa para apagar o que estiver dentro; Shift encaixa na grade.',
  eraseWall: 'Clique numa parede para apagá-la inteira.',
  eraseSegment: 'Clique num trecho para apagar só ele.',
};

/** What the status line says while the draw tool is in each mode. */
export const DRAW_MODE_HINT: Readonly<Record<DrawMode, string>> = {
  draw: DRAW_HINT,
  select: 'Clique num desenho ou arraste uma caixa para pegá-los; Delete apaga.',
};

const TOOL_HINT: Readonly<Record<BoardTool, string | null>> = {
  select: null,
  ruler: RULER_HINT,
  draw: DRAW_HINT,
  area: AREA_HINT,
  walls: WALL_HINT,
  lights: LIGHT_HINT,
  conditions: CONDITION_HINT,
};

// Only the master (who also chooses layers) uses these.
const MASTER_TOOLS: readonly BoardTool[] = ['walls', 'lights'];
// The condition tool is no sketch: it stamps tokens, so the selection stays.
const SKETCH_TOOLS: readonly BoardTool[] = ['draw', 'area', 'walls', 'lights'];
const TOKEN_LAYER_TOOLS: readonly BoardTool[] = ['area', 'conditions'];

/** The modes of the tools that have them (they pick the status line hint). */
export type ToolModes = Readonly<{ wallMode: WallMode; drawMode: DrawMode }>;

/** What the tool switch reads of the interaction. */
export type ToolSwitchState = ToolModes & Readonly<{ canChooseLayer: boolean }>;

/** The interaction fields a tool change sets. */
export type ToolChange = Readonly<{
  tool: BoardTool;
  ruler: null;
  measuring: false;
  notice: string | null;
  selectedWallIds: readonly string[];
  selectedLightIds: readonly string[];
  lightAimPreview: Readonly<Record<string, number>>;
  selectedTokenIds?: readonly string[];
  selectedDrawingIds?: readonly string[];
  selectedEffectAreaIds?: readonly string[];
  activeLayer?: TokenLayerDto;
  drawMode?: DrawMode;
}>;

/** The fields a draw mode change sets: the mode, its hint and an empty selection. */
export type DrawModeChange = Readonly<{ drawMode: DrawMode; notice: string }> & typeof NO_SELECTION;

/** The status line hint of a tool (the walls and draw tools say their mode); `null` says nothing.
 *
 *  Example: `hintOf('walls', { wallMode: 'eraseWall', drawMode: 'draw' })` → `'Clique numa parede para apagá-la inteira.'` */
export function hintOf(tool: BoardTool, modes: ToolModes): string | null {
  if (tool === 'walls') return WALL_MODE_HINT[modes.wallMode];
  if (tool === 'draw') return DRAW_MODE_HINT[modes.drawMode];
  return TOOL_HINT[tool];
}

/** What the store sets when the draw tool's mode changes.
 *
 *  Example: `set(drawModeChangeOf('select'))` */
export function drawModeChangeOf(drawMode: DrawMode): DrawModeChange {
  return { drawMode, notice: DRAW_MODE_HINT[drawMode], ...NO_SELECTION };
}

/** What changes when the tool changes, or `null` when this viewer may not take it (a player and
 *  a tool of the master). The ruler goes, the walls and lights picked go, a sketching tool drops the
 *  selection, the draw tool starts in Desenhar and the area and condition tools go to the Tokens
 *  layer (what they make or stamp lives there).
 *
 *  Example: `const change = toolChangeOf(get(), 'draw'); if (change) set(change)` */
export function toolChangeOf(state: ToolSwitchState, tool: BoardTool): ToolChange | null {
  if (MASTER_TOOLS.includes(tool) && !state.canChooseLayer) return null;
  const selection = SKETCH_TOOLS.includes(tool) ? NO_SELECTION : {};
  const layer = TOKEN_LAYER_TOOLS.includes(tool) ? { activeLayer: 'tokens' as const } : {};
  const drawMode = tool === 'draw' ? { drawMode: 'draw' as const } : {};
  return {
    tool,
    selectedWallIds: [],
    selectedLightIds: [],
    lightAimPreview: {},
    ruler: null,
    measuring: false,
    notice: hintOf(tool, { ...state, drawMode: 'draw' }),
    ...selection,
    ...layer,
    ...drawMode,
  };
}
