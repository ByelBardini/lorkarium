import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import type { EditEntry } from '@/lib/edit-history';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { TableBoardCommandsFake } from '../support/table-board-commands-fake';
import { KAEL_ID, LYRA_ID, VHARN_GRID, kael, lyra } from '../support/table-session-fixtures';

describe('hiding tokens from the players', () => {
  let commands: TableBoardCommandsFake;
  let recorded: EditEntry[];
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    commands = new TableBoardCommandsFake();
    recorded = [];
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
      recordEdit: (entry) => recorded.push(entry),
    });
  });

  const sent = () => commands.sentAs('setTokensHidden').map(({ fields }) => fields);

  it('hiding Lyra and Kael sends one command with both, and one tokensHidden entry', async () => {
    await interaction.getState().setTokensHidden([lyra(), kael()], true);

    expect(sent()).toEqual([{ tokenIds: [LYRA_ID, KAEL_ID], hidden: true }]);
    expect(recorded).toEqual([
      [{ kind: 'tokensHidden', tokenIds: [LYRA_ID, KAEL_ID], hidden: true }],
    ]);
  });

  it('a token already hidden is left out, so undoing never shows it', async () => {
    await interaction.getState().setTokensHidden([lyra({ hidden: true }), kael()], true);

    expect(sent()).toEqual([{ tokenIds: [KAEL_ID], hidden: true }]);
    expect(recorded).toEqual([[{ kind: 'tokensHidden', tokenIds: [KAEL_ID], hidden: true }]]);
  });

  it('every token already in that state sends nothing', async () => {
    await interaction.getState().setTokensHidden([lyra()], false);

    expect(sent()).toEqual([]);
  });

  it.each([
    [true, 'Lyra invisível para os jogadores.'],
    [false, 'Lyra visível para os jogadores.'],
  ])('one token confirmed (hidden %s) says "%s"', async (hidden, said) => {
    await interaction.getState().setTokensHidden([lyra({ hidden: !hidden })], hidden);

    expect(interaction.getState().notice).toBe(said);
  });

  it('a group confirmed says how many: "2 tokens invisíveis para os jogadores."', async () => {
    await interaction.getState().setTokensHidden([lyra(), kael()], true);

    expect(interaction.getState().notice).toBe('2 tokens invisíveis para os jogadores.');
  });

  it('refused (forbidden), the status line says why and nothing enters the undo stack', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });

    await interaction.getState().setTokensHidden([lyra()], true);

    expect(interaction.getState().notice).toBe('recusado: forbidden');
    expect(recorded).toEqual([]);
  });

  it('while reconnecting nothing is sent', async () => {
    interaction.getState().setReadOnly(true);

    await interaction.getState().setTokensHidden([lyra()], true);

    expect(sent()).toEqual([]);
  });
});
