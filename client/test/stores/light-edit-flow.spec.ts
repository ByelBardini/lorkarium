import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { VHARN } from '../support/campaigns-api-fake';
import { BRAZIER_ID, CORRIDOR_TORCH_ID, brazier, corridorTorch } from '../support/light-fixtures';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';

describe('editing map lights', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
      recordEdit: (entry) => recorded.push(entry),
    });
  });

  it('moving the torch sends one moveLights expecting where it was, and records the move', async () => {
    await interaction.getState().moveLight(corridorTorch(), { x: 7, y: 5.5 });

    expect(commands.sentAs('moveLights').map(({ fields }) => fields)).toEqual([
      { moves: [{ lightId: CORRIDOR_TORCH_ID, x: 7, y: 5.5, expect: { x: 5, y: 5 } }] },
    ]);
    expect(recorded).toEqual([
      [
        {
          kind: 'lightsMoved',
          moves: [{ lightId: CORRIDOR_TORCH_ID, from: { x: 5, y: 5 }, to: { x: 7, y: 5.5 } }],
        },
      ],
    ]);
  });

  it('a refused move puts the light back and says why', async () => {
    commands.answerWith({ ok: false, failure: 'light_not_found' });
    interaction.getState().previewLight(CORRIDOR_TORCH_ID, { x: 7, y: 5.5 });

    await interaction.getState().moveLight(corridorTorch(), { x: 7, y: 5.5 });

    expect(interaction.getState().lightPreview).toEqual({});
    expect(interaction.getState().notice).toBe('recusado: light_not_found');
    expect(recorded).toEqual([]);
  });

  it('a new reach for two lights sends one setLightRanges expecting each old reach', async () => {
    await interaction
      .getState()
      .changeLightRanges([corridorTorch(), brazier()], { bright: 6, dim: 6 });

    expect(commands.sentAs('setLightRanges').map(({ fields }) => fields)).toEqual([
      {
        changes: [
          { lightId: CORRIDOR_TORCH_ID, bright: 6, dim: 6, expect: { bright: 4, dim: 4 } },
          { lightId: BRAZIER_ID, bright: 6, dim: 6, expect: { bright: 2, dim: 6 } },
        ],
      },
    ]);
    expect(recorded).toEqual([
      [
        {
          kind: 'lightRangesChanged',
          changes: [
            { lightId: CORRIDOR_TORCH_ID, from: { bright: 4, dim: 4 }, to: { bright: 6, dim: 6 } },
            { lightId: BRAZIER_ID, from: { bright: 2, dim: 6 }, to: { bright: 6, dim: 6 } },
          ],
        },
      ],
    ]);
  });

  it('deleting the selected torch sends one deleteLights, unselects it and records it', async () => {
    interaction
      .getState()
      .pointer({ kind: 'lightPicked', lightId: CORRIDOR_TORCH_ID, additive: false });

    await interaction.getState().deleteLights([corridorTorch()]);

    expect(commands.sentAs('deleteLights').map(({ fields }) => fields)).toEqual([
      { lightIds: [CORRIDOR_TORCH_ID], expect: [{ lightId: CORRIDOR_TORCH_ID, x: 5, y: 5 }] },
    ]);
    expect(interaction.getState().selectedLightIds).toEqual([]);
    expect(recorded).toEqual([
      [
        {
          kind: 'lightsRemoved',
          lights: [{ id: CORRIDOR_TORCH_ID, placement: { x: 5, y: 5, bright: 4, dim: 4 } }],
        },
      ],
    ]);
  });

  it('a refused delete keeps the light selected and says why', async () => {
    commands.answerWith({ ok: false, failure: 'stale_undo' });
    interaction
      .getState()
      .pointer({ kind: 'lightPicked', lightId: CORRIDOR_TORCH_ID, additive: false });

    await interaction.getState().deleteLights([corridorTorch()]);

    expect(interaction.getState().selectedLightIds).toEqual([CORRIDOR_TORCH_ID]);
    expect(interaction.getState().notice).toBe('recusado: stale_undo');
  });

  it('a click on a light picks it alone; with Shift it toggles it in the selection', () => {
    const pick = (lightId: string, additive: boolean) =>
      interaction.getState().pointer({ kind: 'lightPicked', lightId, additive });

    pick(CORRIDOR_TORCH_ID, false);
    pick(BRAZIER_ID, true);
    expect(interaction.getState().selectedLightIds).toEqual([CORRIDOR_TORCH_ID, BRAZIER_ID]);
    pick(CORRIDOR_TORCH_ID, true);
    expect(interaction.getState().selectedLightIds).toEqual([BRAZIER_ID]);
  });
});
