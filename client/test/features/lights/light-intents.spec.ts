import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { routeLightIntent } from '@/features/lights/light-intents';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createLightColorStore, type LightColorStore } from '@/stores/light-color-store';
import { createLightReachStore, type LightReachStore } from '@/stores/light-reach-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { StorageFake } from '../../support/storage-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import { CORRIDOR_TORCH_ID, corridorTorch } from '../../support/light-fixtures';
import { vharnBoard } from '../../support/table-session-fixtures';

describe('routeLightIntent', () => {
  let commands: TableBoardCommandsFake;
  let interaction: StoreApi<BoardInteractionStore>;
  let lightReach: StoreApi<LightReachStore>;
  let lightColor: StoreApi<LightColorStore>;
  let board: StoreApi<BoardStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
    lightReach = createLightReachStore(new StorageFake());
    lightColor = createLightColorStore(new StorageFake());
    board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({ kind: 'board', state: vharnBoard({ lights: [corridorTorch()] }) });
  });

  it('a light placed goes to the server with the reach remembered for the next light', () => {
    lightReach.getState().setReach({ bright: 6, dim: 2 });

    expect(
      routeLightIntent(
        { board, interaction, lightReach, lightColor },
        { kind: 'lightPlaced', x: 5.5, y: 3 },
      ),
    ).toBe(true);
    expect(commands.sentAs('createLights').map(({ fields }) => fields)).toEqual([
      { lights: [{ x: 5.5, y: 3, bright: 6, dim: 2, color: null, facing: 0, angle: 360 }] },
    ]);
  });

  it('a light placed takes the color of the panel', () => {
    lightColor.getState().setColor('infernal');

    routeLightIntent(
      { board, interaction, lightReach, lightColor },
      { kind: 'lightPlaced', x: 5.5, y: 3 },
    );

    expect(commands.sentAs('createLights').map(({ fields }) => fields)).toEqual([
      { lights: [{ x: 5.5, y: 3, bright: 4, dim: 4, color: 'infernal', facing: 0, angle: 360 }] },
    ]);
  });

  it('an intent about anything else is not taken', () => {
    expect(
      routeLightIntent(
        { board, interaction, lightReach, lightColor },
        { kind: 'cameraChanged', zoom: 2 },
      ),
    ).toBe(false);
    expect(commands.sent).toEqual([]);
  });

  it('a light dropped is moved from where the board has it to where it was dropped', async () => {
    const route = (intent: Parameters<typeof routeLightIntent>[1]) =>
      routeLightIntent({ board, interaction, lightReach, lightColor }, intent);

    route({ kind: 'lightDropped', lightId: CORRIDOR_TORCH_ID, x: 7, y: 5.5 });

    expect(commands.sentAs('moveLights').map(({ fields }) => fields)).toEqual([
      { moves: [{ lightId: CORRIDOR_TORCH_ID, x: 7, y: 5.5, expect: { x: 5, y: 5 } }] },
    ]);
  });

  it('a light dragged shows at once where it goes, for this viewer only', () => {
    routeLightIntent(
      { board, interaction, lightReach, lightColor },
      { kind: 'lightMovePreviewed', lightId: CORRIDOR_TORCH_ID, point: { x: 6, y: 5 } },
    );

    expect(interaction.getState().lightPreview).toEqual({ [CORRIDOR_TORCH_ID]: { x: 6, y: 5 } });
  });
});
