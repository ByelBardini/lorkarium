import type { StoreApi } from 'zustand/vanilla';
import { effectAreaReshapedAnnouncement } from '@/features/board/board-messages';
import { effectAreaSize } from '@/lib/effect-area-label';
import { sameEffectAreaShape, shapeOfEffectArea } from '@/lib/effect-area-shape';
import { effectAreaKindLabel } from '@/lib/effect-area-style';
import type { BoardIntent } from '@/renderer/board-renderer';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';

export type EffectAreaIntentStores = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
}>;

/** Routes what the board says about areas of effect: the area tool released (create), a handle
 *  dragged (the local preview) or released (one reshape with its announcement). Answers whether
 *  the intent was one of these.
 *
 *  Example: `if (routeEffectAreaIntent({ board, interaction }, intent)) return;` */
export function routeEffectAreaIntent(
  stores: EffectAreaIntentStores,
  intent: BoardIntent,
): boolean {
  const local = stores.interaction.getState();
  if (intent.kind === 'effectAreaSketched') {
    void local.finishEffectArea(intent.shape);
    return true;
  }
  if (intent.kind === 'effectAreaReshapePreviewed') {
    local.previewEffectArea(intent.effectAreaId, intent.shape);
    return true;
  }
  if (intent.kind !== 'effectAreaReshaped') return false;
  reshapeByHandle(stores, intent);
  return true;
}

// Released on the shape it already had, the handles change nothing.
function reshapeByHandle(
  { board, interaction }: EffectAreaIntentStores,
  intent: Extract<BoardIntent, { kind: 'effectAreaReshaped' }>,
): void {
  const local = interaction.getState();
  const state = board.getState().board;
  const area = state?.effectAreas.find(({ id }) => id === intent.effectAreaId);
  if (!state || !area) return local.previewEffectArea(intent.effectAreaId, null);
  const from = shapeOfEffectArea(area);
  if (sameEffectAreaShape(from, intent.shape)) return local.previewEffectArea(area.id, null);
  const reshape = { effectAreaId: area.id, from, to: intent.shape };
  const size = effectAreaSize(intent.shape, state.scene);
  const announce = effectAreaReshapedAnnouncement(effectAreaKindLabel(area.kind), size);
  void local.reshapeEffectAreas([reshape], announce);
}
