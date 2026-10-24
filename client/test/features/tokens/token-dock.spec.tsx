import type { BoardStateDto } from '@lorkarium/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { TokenDock } from '@/features/tokens/token-dock';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  KAEL_COMBATANT,
  KAEL_ID,
  LYRA_COMBATANT,
  LYRA_ID,
  LYRA_PV_ID,
  kael,
  lyra,
  soloCombatant,
  VHARN_SCENE,
  vharnBoard,
  vharnCombat,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

describe('TokenDock', () => {
  let board: StoreApi<BoardStore>;
  let presence: StoreApi<TablePresenceStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;
  let edited: string[];

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    presence = createTablePresenceStore(VHARN.id);
    presence.setState({ members: [ANA_AT_TABLE, BIA_AT_TABLE] });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands,
      describeRefusal: String,
    });
    edited = [];
  });

  function renderDock(
    state: Partial<BoardStateDto> = {},
    isMaster = true,
    selected: readonly string[] = [LYRA_ID],
  ): void {
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [lyra()], ...state }) });
    interaction.getState().selectMany([...selected], { additive: false });
    render(
      <TokenDock
        board={board}
        presence={presence}
        interaction={interaction}
        isMaster={isMaster}
        onEditToken={(tokenId) => edited.push(tokenId)}
      />,
    );
  }

  const dock = () => screen.getByRole('region', { name: 'Token selecionado' });
  const pvTrigger = () => within(dock()).getByRole('button', { name: 'Editar PV de Lyra' });
  const balloon = () => screen.queryByRole('dialog', { name: 'PV' });

  it('names the token, who plays it and where it is (cells counted from 1)', () => {
    renderDock();

    expect(within(dock()).getByRole('heading', { name: 'Lyra' })).toBeInTheDocument();
    expect(dock()).toHaveTextContent('Jogado por Bia');
    expect(dock()).toHaveTextContent('Coluna 4, linha 5 · 1 × 1 casas · Olha para o leste');
  });

  it('"Fechar ficha" clears the selection, and the detail goes', async () => {
    renderDock();

    await userEvent.click(screen.getByRole('button', { name: 'Fechar ficha' }));

    expect(interaction.getState().selectedTokenIds).toEqual([]);
    expect(screen.queryByRole('region', { name: 'Token selecionado' })).toBeNull();
  });

  it('every bar received shows with its value, with no field under it', () => {
    renderDock();

    expect(dock()).toHaveTextContent('PV32 / 45');
    expect(dock()).toHaveTextContent('Inspiração1 / 1');
    expect(within(dock()).queryByRole('textbox', { name: 'PV de Lyra' })).toBeNull();
  });

  it('a double click on the PV opens its balloon, and "−7" + Enter subtracts 7', async () => {
    renderDock();

    await userEvent.dblClick(pvTrigger());
    const current = within(balloon() ?? document.body).getByRole('textbox', { name: 'Atual' });
    await userEvent.clear(current);
    await userEvent.type(current, '−7{Enter}');

    expect(commands.sentAs('adjustBar').map(({ fields }) => fields)).toEqual([
      { tokenId: LYRA_ID, barId: LYRA_PV_ID, change: { op: 'add', amount: -7 } },
    ]);
    expect(balloon()).toBeNull();
  });

  it('without canControl the bars only read: nothing to open', () => {
    renderDock({ tokens: [lyra({ canControl: false })] }, false);

    expect(dock()).toHaveTextContent('PV32 / 45');
    expect(within(dock()).queryByRole('button', { name: /^Editar / })).toBeNull();
  });

  it('while reconnecting the balloon does not open', async () => {
    renderDock();
    act(() => interaction.getState().setReadOnly(true));

    await userEvent.dblClick(pvTrigger());

    expect(balloon()).toBeNull();
  });

  it('a token without bars says so, and tells the master where to make one', () => {
    renderDock({ tokens: [lyra({ bars: [] })] });

    expect(dock()).toHaveTextContent('Esse token não tem barras. Dá pra criar em Editar token.');
  });

  it('a player is only told the token has no bars', () => {
    renderDock({ tokens: [lyra({ bars: [] })] }, false);

    expect(dock()).toHaveTextContent('Esse token não tem barras.');
    expect(dock()).not.toHaveTextContent('Editar token');
  });

  it('the master with two selected and no main token opens no detail', () => {
    renderDock({ tokens: [lyra(), kael()] }, true, [LYRA_ID, kael().id]);

    expect(screen.queryByRole('region', { name: 'Token selecionado' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Token principal' })).toBeNull();
  });

  it('the facing reads "Olha para o sul" at 90, and half a cell takes a comma', () => {
    renderDock({ tokens: [lyra({ facing: 90, width: 2.5 })] });

    expect(dock()).toHaveTextContent('2,5 × 1 casas · Olha para o sul');
  });

  it('a percent bar of a token one controls reads the numbers too: "71% · 32 / 45"', () => {
    const [pv, inspiration] = lyra().bars;
    if (!pv || !inspiration) throw new Error('lyra() lost its bars');
    renderDock({ tokens: [lyra({ bars: [{ ...pv, display: 'percent' }, inspiration] })] });

    expect(within(dock()).getByText('71% · 32 / 45')).toBeInTheDocument();
  });

  it('a percent bar of a token one does not control reads only "100%"', () => {
    const [, inspiration] = lyra().bars;
    if (!inspiration) throw new Error('lyra() lost its bars');
    const percent = { ...inspiration, display: 'percent' as const };
    renderDock({ tokens: [lyra({ canControl: false, bars: [percent] })] }, false);

    expect(within(dock()).getByText('100%')).toBeInTheDocument();
  });

  it('a negative value reads "−4 / 38" in the error color', () => {
    const [pv, inspiration] = lyra().bars;
    if (!pv || !inspiration) throw new Error('lyra() lost its bars');
    renderDock({ tokens: [lyra({ bars: [{ ...pv, current: -4, max: 38 }, inspiration] })] });

    expect(within(dock()).getByText('−4 / 38')).toHaveClass('text-destructive-text');
  });

  it.each([
    [-10, 'negative'],
    [50, 'over'],
  ] as const)('%s of 40 grows a %s bar of 25%% from the left', (current, state) => {
    const [pv, inspiration] = lyra().bars;
    if (!pv || !inspiration) throw new Error('lyra() lost its bars');
    renderDock({ tokens: [lyra({ bars: [{ ...pv, current, max: 40 }, inspiration] })] });

    const excess = dock().querySelector<HTMLElement>(`[data-bar-excess="${state}"]`);
    expect(excess?.style.width).toBe('25%');
  });

  it('a redacted token shows only the bars that came', () => {
    renderDock({ tokens: [lyra({ canControl: false, bars: lyra().bars.slice(1) })] }, false);

    expect(within(dock()).queryByText('PV')).toBeNull();
    expect(within(dock()).getByText('Inspiração')).toBeInTheDocument();
  });

  // Regression: the suggestions opened inside the detail, which scrolls on its own, and were cut
  // at the foot of the panel (2026-10-21).
  it('the condition suggestions float outside the detail, so its scroll never cuts them', async () => {
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({
        tokens: [lyra()],
        conditionDefinitions: [
          { id: 'c-1', name: 'Envenenado', tone: 'harm', icon: 'skull', look: null },
        ],
      }),
    });
    interaction.getState().select(LYRA_ID);
    render(
      <TokenDock
        board={board}
        presence={presence}
        interaction={interaction}
        isMaster
        onEditToken={() => undefined}
      />,
    );

    await userEvent.click(within(dock()).getByRole('combobox', { name: 'Adicionar condição' }));

    const list = screen.getByRole('listbox', { name: 'Condições da mesa' });
    expect(dock()).not.toContainElement(list);
    expect(within(list).getByRole('option', { name: 'Envenenado' })).toBeInTheDocument();
  });

  describe('the actions', () => {
    const combat = vharnCombat({
      currentCombatantId: KAEL_COMBATANT,
      combatants: [
        soloCombatant(KAEL_COMBATANT, 'kael-token', 18, 0),
        soloCombatant(LYRA_COMBATANT, LYRA_ID, 14, 1),
      ],
    });

    it('in combat, whoever runs the entry sets its initiative from the detail', async () => {
      renderDock({ combat }, false);
      const field = within(dock()).getByRole('textbox', { name: 'Iniciativa de Lyra' });

      await userEvent.clear(field);
      await userEvent.type(field, '9{Enter}');

      expect(commands.sentAs('setInitiative').map(({ fields }) => fields)).toEqual([
        { combatantId: LYRA_COMBATANT, initiative: 9 },
      ]);
      expect(within(dock()).queryByRole('button', { name: 'Tirar do combate' })).toBeNull();
    });

    it('"Tirar do combate" (master) takes only this token out', async () => {
      renderDock({ combat });

      await userEvent.click(within(dock()).getByRole('button', { name: 'Tirar do combate' }));

      expect(commands.sentAs('regroupTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: [LYRA_ID], target: { kind: 'out' } },
      ]);
    });

    it('"Editar token" (master) asks to edit this token', async () => {
      renderDock();

      await userEvent.click(within(dock()).getByRole('button', { name: 'Editar token' }));

      expect(edited).toEqual([LYRA_ID]);
    });

    it('out of combat there is no initiative nor "Tirar do combate"', () => {
      renderDock();

      expect(within(dock()).queryByRole('textbox', { name: /^Iniciativa/ })).toBeNull();
      expect(within(dock()).queryByRole('button', { name: 'Tirar do combate' })).toBeNull();
    });

    it('a player who does not run the entry has no action', () => {
      renderDock({ combat, tokens: [lyra({ canControl: false })] }, false);

      expect(within(dock()).queryByRole('textbox', { name: /^Iniciativa/ })).toBeNull();
      expect(within(dock()).queryByRole('button', { name: 'Editar token' })).toBeNull();
    });
  });

  describe('the main token', () => {
    const asBia = { viewer: { userId: BIA_AT_TABLE.userId, role: 'player' as const } };
    const mainDock = () => screen.getByRole('region', { name: 'Token principal' });

    function renderForBia(state: Partial<BoardStateDto> = {}, selected: readonly string[] = []) {
      renderDock({ ...asBia, tokens: [lyra(), kael()], ...state }, false, selected);
    }

    it('with nothing selected Bia sees her Lyra, its bars and the "Principal" mark, with no "Fechar ficha"', () => {
      renderForBia();

      expect(within(mainDock()).getByRole('heading', { name: 'Lyra' })).toBeInTheDocument();
      expect(mainDock()).toHaveTextContent('PV32 / 45');
      expect(
        within(mainDock()).getByRole('button', { name: 'Editar PV de Lyra' }),
      ).toBeInTheDocument();
      expect(within(mainDock()).getByText('Principal')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Fechar ficha' })).toBeNull();
    });

    it('selecting Kael shows Kael with "Fechar ficha", which brings Lyra back', async () => {
      renderForBia({}, [KAEL_ID]);

      expect(within(dock()).getByRole('heading', { name: 'Kael' })).toBeInTheDocument();
      await userEvent.click(within(dock()).getByRole('button', { name: 'Fechar ficha' }));

      expect(within(mainDock()).getByRole('heading', { name: 'Lyra' })).toBeInTheDocument();
    });

    it('selecting her own Lyra keeps the "Principal" mark and no "Fechar ficha"', () => {
      renderForBia({}, [LYRA_ID]);

      expect(within(dock()).getByText('Principal')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Fechar ficha' })).toBeNull();
    });

    it('with two selected the main token shows', () => {
      renderForBia({}, [LYRA_ID, KAEL_ID]);

      expect(within(mainDock()).getByRole('heading', { name: 'Lyra' })).toBeInTheDocument();
    });

    it('a selected token hidden by the dark gives way to the main token', () => {
      const unseen = kael({ canControl: false, controllerIds: [] });
      renderForBia({ scene: { ...VHARN_SCENE, vision: 'dark' }, tokens: [lyra(), unseen] }, [
        KAEL_ID,
      ]);

      expect(within(mainDock()).getByRole('heading', { name: 'Lyra' })).toBeInTheDocument();
    });
  });
});
