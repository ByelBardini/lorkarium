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

describe('lighting and putting out map lights', () => {
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

  it('putting out two lights sends one setLightsLit and says "Luz apagada."', async () => {
    await interaction.getState().setLightsLit([corridorTorch(), brazier()], false);

    expect(commands.sentAs('setLightsLit').map(({ fields }) => fields)).toEqual([
      { lightIds: [CORRIDOR_TORCH_ID, BRAZIER_ID], lit: false },
    ]);
    expect(interaction.getState().notice).toBe('Luz apagada.');
  });

  it('lighting a light says "Luz acesa."', async () => {
    await interaction.getState().setLightsLit([corridorTorch({ lit: false })], true);

    expect(interaction.getState().notice).toBe('Luz acesa.');
  });

  it('refused, the status line says why', async () => {
    commands.answerWith({ ok: false, failure: 'light_not_found' });

    await interaction.getState().setLightsLit([corridorTorch()], false);

    expect(interaction.getState().notice).toBe('recusado: light_not_found');
  });

  it('read only, nothing is sent', async () => {
    interaction.getState().setReadOnly(true);

    await interaction.getState().setLightsLit([corridorTorch()], false);

    expect(commands.sent).toEqual([]);
  });

  it('nothing goes on the undo stack: lighting is a game action, like a door', async () => {
    await interaction.getState().setLightsLit([corridorTorch()], false);

    expect(recorded).toEqual([]);
  });
});
