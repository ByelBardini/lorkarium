import type { TokenLayerDto } from '@lorkarium/contracts';
import type { WallMode } from '@/renderer/wall-view';
import { NO_SELECTION } from './board-pointer-intents';

export type BoardTool = 'select' | 'ruler' | 'draw' | 'area' | 'walls' | 'lights';
export type { WallMode };

export const RULER_HINT = 'Arraste para medir.';
export const DRAW_HINT = 'Arraste para desenhar; Shift encaixa a forma na grade.';
export const AREA_HINT = 'Arraste a partir de onde a magia nasce; Shift encaixa a forma perfeita.';
export const WALL_HINT = 'Arraste para criar a parede; Shift encaixa na grade.';
export const LIGHT_HINT = 'Clique para pôr uma luz; Shift encaixa na meia casa.';

/** What the status line says while the walls tool is in each mode. */
export const WALL_MODE_HINT: Readonly<Record<WallMode, string>> = {
  draw: WALL_HINT,
  eraseArea: 'Arraste uma caixa para apagar o que estiver dentro; Shift encaixa na grade.',
  eraseWall: 'Clique numa parede para apagá-la inteira.',
  eraseSegment: 'Clique num trecho para apagar só ele.',
};

const TOOL_HINT: Readonly<Record<BoardTool, string | null>> = {
  select: null,
  ruler: RULER_HINT,
  draw: DRAW_HINT,
  area: AREA_HINT,
  walls: WALL_HINT,
  lights: LIGHT_HINT,
};

// Only the master (who also chooses layers) uses these.
const MASTER_TOOLS: readonly BoardTool[] = ['walls', 'lights'];
const SKETCH_TOOLS: readonly BoardTool[] = ['draw', 'area', 'walls', 'lights'];

/** What the tool switch reads of the interaction. */
export type ToolSwitchState = Readonly<{ canChooseLayer: boolean; wallMode: WallMode }>;

/** The interaction fields a tool change sets. */
export type ToolChange = Readonly<{
  tool: BoardTool;
  ruler: null;
  measuring: false;
  notice: string | null;
  selectedWallIds: readonly string[];
  selectedLightIds: readonly string[];
  selectedTokenIds?: readonly string[];
  selectedDrawingIds?: readonly string[];
  selectedEffectAreaIds?: readonly string[];
  activeLayer?: TokenLayerDto;
}>;

/** The status line hint of a tool (the walls tool says its mode); `null` says nothing.
 *
 *  Example: `hintOf('walls', 'eraseWall')` → `'Clique numa parede para apagá-la inteira.'` */
export function hintOf(tool: BoardTool, wallMode: WallMode): string | null {
  return tool === 'walls' ? WALL_MODE_HINT[wallMode] : TOOL_HINT[tool];
}

/** What changes when the tool changes, or `null` when this viewer may not take it (a player and
 *  a tool of the master). The ruler goes, the walls and lights picked go, a sketching tool drops the
 *  selection and the area tool goes to the Tokens layer (what it makes lives there).
 *
 *  Example: `const change = toolChangeOf(get(), 'draw'); if (change) set(change)` */
export function toolChangeOf(state: ToolSwitchState, tool: BoardTool): ToolChange | null {
  if (MASTER_TOOLS.includes(tool) && !state.canChooseLayer) return null;
  const selection = SKETCH_TOOLS.includes(tool) ? NO_SELECTION : {};
  const layer = tool === 'area' ? { activeLayer: 'tokens' as const } : {};
  return {
    tool,
    selectedWallIds: [],
    selectedLightIds: [],
    ruler: null,
    measuring: false,
    notice: hintOf(tool, state.wallMode),
    ...selection,
    ...layer,
  };
}
