import type { BoardIntent, BoardPointerIntent } from '@/renderer/board-renderer';
import type { BoardInteractionState } from './board-interaction-store';

/** Nothing selected: no tokens, drawings nor areas. */
export const NO_SELECTION = {
  selectedTokenIds: [],
  selectedDrawingIds: [],
  selectedEffectAreaIds: [],
  selectedWallIds: [],
  selectedLightIds: [],
} as const;

/** The ids picked, added to the current ones (`additive`) or in their place, without repeats. */
export function joined(
  current: readonly string[],
  tokenIds: readonly string[],
  additive: boolean,
): string[] {
  return [...new Set([...(additive ? current : []), ...tokenIds])];
}

/** The ids with `tokenId` taken out when present, added when not. */
export function toggled(ids: readonly string[], tokenId: string): string[] {
  return ids.includes(tokenId) ? ids.filter((id) => id !== tokenId) : [...ids, tokenId];
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
    case 'effectAreaPicked': {
      const { effectAreaId, additive } = intent;
      const areas = additive ? toggled(state.selectedEffectAreaIds, effectAreaId) : [effectAreaId];
      return { ...kept(additive), selectedEffectAreaIds: areas };
    }
    // Walls are picked with their own tool: a click replaces the walls only.
    case 'wallPicked': {
      const { wallId, additive } = intent;
      return { selectedWallIds: additive ? toggled(state.selectedWallIds, wallId) : [wallId] };
    }
    // Lights are picked with their own tool: a click replaces the lights only.
    case 'lightPicked': {
      const { lightId, additive } = intent;
      return { selectedLightIds: additive ? toggled(state.selectedLightIds, lightId) : [lightId] };
    }
    // Right after its tokensMarqueed too: only adds.
    case 'effectAreasMarqueed': {
      const areas = joined(state.selectedEffectAreaIds, intent.effectAreaIds, true);
      return { selectedEffectAreaIds: areas };
    }
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

/** What the local board state becomes after one intent of the canvas: the camera, the hovered
 *  cell, the selection, and the ruler of the ruler tool.
 *
 *  Example: `set(afterIntent(get(), intent))` */
export function afterIntent(
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
