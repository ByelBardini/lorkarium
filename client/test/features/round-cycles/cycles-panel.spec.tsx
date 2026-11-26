import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { CyclesPanel } from '@/features/round-cycles/cycles-panel';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createCharactersStore, type CharactersStore } from '@/stores/characters-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import type { RoundCycleDto } from '@lorkarium/contracts';
import { AssetsApiFake } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { lyraCharacter, tableSynced } from '../../support/character-fixtures';
import { MOON_ID, moonCycle } from '../../support/round-cycle-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  BIA_AT_TABLE,
  CAIO_AT_TABLE,
  VHARN_GRID,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

describe('CyclesPanel', () => {
  let board: StoreApi<BoardStore>;
  let characters: StoreApi<CharactersStore>;
  let presence: StoreApi<TablePresenceStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    board.getState().apply({ kind: 'board', state: vharnBoard() });
    characters = createCharactersStore(VHARN.id, () => undefined);
    presence = createTablePresenceStore(VHARN.id);
    presence.getState().apply({ kind: 'state', state: vharnState() });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: String,
    });
  });

  function renderPanel(...cycles: RoundCycleDto[]): void {
    characters.getState().apply(tableSynced(3, [lyraCharacter()], [], cycles));
    const images = { campaignId: VHARN.id, assets: new AssetsApiFake() };
    render(
      <CyclesPanel
        table={{ characters, board, presence }}
        interaction={interaction}
        images={images}
      />,
    );
  }

  const config = {
    holder: { kind: 'table' },
    visibility: 'some',
    seerIds: [BIA_AT_TABLE.userId],
    chooserIds: [],
  } as const;

  it('with no cycle it says what a cycle is', () => {
    renderPanel();
    expect(screen.getByRole('region', { name: 'Ciclos da mesa' })).toHaveTextContent(
      'Nenhum ciclo ainda',
    );
  });

  it('lists each cycle with whose it is, who sees it and its phase in this combat', () => {
    renderPanel(
      moonCycle({
        current: 2,
        config: { ...config, seerIds: [...config.seerIds], chooserIds: [] },
      }),
    );
    const item = screen.getAllByRole('listitem')[0] as HTMLElement;
    expect(item).toHaveTextContent('Fases da Lua');
    expect(item).toHaveTextContent(
      'A mesa (todo combate) · Só alguns jogadores · Anuncia cada fase',
    );
    expect(item).toHaveTextContent('Neste combate: Lua Cheia');
  });

  it('each cycle previews its phases in order, the one of this combat marked', () => {
    renderPanel(moonCycle({ current: 2 }));
    const strip = screen.getByRole('list', { name: 'Fases de Fases da Lua' });
    const phases = within(strip).getAllByRole('listitem');
    expect(phases.map((phase) => phase.getAttribute('title'))).toEqual([
      'Lua Nova',
      'Crescente',
      'Lua Cheia',
      'Minguante',
    ]);
    expect(phases.map((phase) => phase.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'step',
      null,
    ]);
  });

  it('"Novo ciclo" saves the name, the phases, who sees and who chooses, and the announcement', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }));
    const dialog = screen.getByRole('dialog', { name: 'Novo ciclo' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Fases da Lua');
    await userEvent.type(within(dialog).getByLabelText('Nome da fase 1'), 'Lua Nova');
    await userEvent.type(within(dialog).getByLabelText('Nome da fase 2'), 'Lua Cheia');
    await userEvent.click(within(dialog).getByLabelText(/Só alguns jogadores/));
    await userEvent.click(within(dialog).getAllByLabelText(BIA_AT_TABLE.name)[1] as HTMLElement);
    await userEvent.click(within(dialog).getByLabelText(/Anunciar cada fase/));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar ciclo' }));

    expect(commands.sent.at(-1)).toMatchObject({
      name: 'defineRoundCycle',
      fields: {
        name: 'Fases da Lua',
        holder: { kind: 'table' },
        visibility: 'some',
        seerIds: [BIA_AT_TABLE.userId],
        chooserIds: [BIA_AT_TABLE.userId],
        announce: true,
        phases: [
          { name: 'Lua Nova', imageAssetId: null },
          { name: 'Lua Cheia', imageAssetId: null },
        ],
      },
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a cycle can belong to a character of the table', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Pertence a' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toContain('Lyra');
  });

  it('a nameless cycle is not sent and says why', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }));

    await userEvent.click(screen.getByRole('button', { name: 'Salvar ciclo' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Dê um nome ao ciclo.');
    expect(commands.sent).toEqual([]);
  });

  it('two phases cannot lose another; twelve take no more', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Novo ciclo' }));
    const dialog = screen.getByRole('dialog');
    const removes = within(dialog).getAllByRole('button', { name: /Tirar a fase/ });
    expect(removes.every((button) => button.hasAttribute('disabled'))).toBe(true);
    const add = within(dialog).getByRole('button', { name: 'Adicionar fase' });
    for (let i = 0; i < 10; i++) await userEvent.click(add);
    expect(add).toBeDisabled();
  });

  it('editing sends the whole cycle with its id; deleting asks twice', async () => {
    renderPanel(
      moonCycle({ config: { ...config, seerIds: [CAIO_AT_TABLE.userId], chooserIds: [] } }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Editar Fases da Lua' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar ciclo' }));
    expect(commands.sent.at(-1)).toMatchObject({
      name: 'updateRoundCycle',
      fields: { cycleId: MOON_ID },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Apagar Fases da Lua' }));
    expect(commands.sent.at(-1)?.name).toBe('updateRoundCycle');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar: apagar Fases da Lua' }));
    expect(commands.sent.at(-1)).toMatchObject({
      name: 'deleteRoundCycle',
      fields: { cycleId: MOON_ID },
    });
  });

  it('a refused save keeps the editor open', async () => {
    commands.answerWith({ ok: false, failure: 'cycle_limit' });
    renderPanel(
      moonCycle({ config: { ...config, seerIds: [CAIO_AT_TABLE.userId], chooserIds: [] } }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Editar Fases da Lua' }));

    await userEvent.click(screen.getByRole('button', { name: 'Salvar ciclo' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(interaction.getState().notice).toBe('cycle_limit');
  });
});
