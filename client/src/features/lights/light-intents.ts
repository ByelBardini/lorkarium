import type { StoreApi } from 'zustand/vanilla';
import type { BoardIntent } from '@/renderer/board-renderer';
import type { BoardInteractionStore } from '@/stores/board-interaction-store';
import type { BoardStore } from '@/stores/board-store';
import { lightReachOf, type LightReachStore } from '@/stores/light-reach-store';

export type LightIntentStores = Readonly<{
  board: StoreApi<BoardStore>;
  interaction: StoreApi<BoardInteractionStore>;
  lightReach: StoreApi<LightReachStore>;
}>;

/** Routes what the board says about map lights: a click on the empty board (put a light there
 *  with the remembered reach), a click on an icon (the selection), a drag (the local preview) and
 *  a drop (one move). Answers whether the intent was one of these.
 *
 *  Example: `if (routeLightIntent({ board, interaction, lightReach }, intent)) return;` */
export function routeLightIntent(stores: LightIntentStores, intent: BoardIntent): boolean {
  const local = stores.interaction.getState();
  switch (intent.kind) {
    case 'lightPlaced': {
      const reach = lightReachOf(stores.lightReach.getState());
      void local.placeLight({ x: intent.x, y: intent.y }, reach);
      return true;
    }
    case 'lightPicked':
      local.pointer(intent);
      return true;
    case 'lightMovePreviewed':
      local.previewLight(intent.lightId, intent.point);
      return true;
    case 'lightDropped': {
      const light = stores.board.getState().board?.lights.find(({ id }) => id === intent.lightId);
      if (light) void local.moveLight(light, { x: intent.x, y: intent.y });
      return true;
    }
    default:
      return false;
  }
}
