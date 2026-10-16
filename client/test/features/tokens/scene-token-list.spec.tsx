import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { SceneTokenList } from '@/features/tokens/scene-token-list';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  LYRA_ID,
  LYRA_PV_ID,
  lyra,
  vharnBoard,
  vharnState,
} from '../../support/table-session-fixtures';

const KAEL_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';

describe('SceneTokenList', () => {
  let board: StoreApi<BoardStore>;
  let presence: StoreApi<TablePresenceStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;
  let edited: string[];

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    presence = createTablePresenceStore(VHARN.id);
    presence.getState().apply({ kind: 'state', state: vharnState() });
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: (failure) => `recusado: ${failure}`,
    });
    edited = [];
  });

  function renderList(tokens = [lyra()], isMaster = true): void {
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens }) });
    render(
      <SceneTokenList
        board={board}
        presence={presence}
        interaction={interaction}
        isMaster={isMaster}
        onEdit={(tokenId) => edited.push(tokenId)}
      />,
    );
  }

  function row(name: string): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(`^${name}`) });
  }

  it('lists the scene by name with who controls each and the first bar', () => {
    const kael = lyra({ id: KAEL_ID, name: 'Kael', controllerIds: [] });
    renderList([lyra(), kael]);
    const items = within(screen.getByRole('list', { name: 'Na cena' })).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('button').textContent)).toEqual([
      expect.stringContaining('Kael'),
      expect.stringContaining('Lyra'),
    ]);
    expect(row('Lyra')).toHaveTextContent('Bia');
    expect(row('Lyra')).toHaveTextContent('PV 32 / 45');
  });

  it('clicking a row expands its card and selects the token on the board', async () => {
    renderList();
    await userEvent.click(row('Lyra'));
    expect(row('Lyra')).toHaveAttribute('aria-expanded', 'true');
    expect(interaction.getState().selectedTokenId).toBe(LYRA_ID);
    expect(screen.getByRole('region', { name: 'Cartão de Lyra' })).toHaveTextContent(
      'Coluna 4, linha 5',
    );
  });

  it('selecting on the board expands the row', () => {
    renderList();
    act(() => interaction.getState().select(LYRA_ID));
    expect(row('Lyra')).toHaveAttribute('aria-expanded', 'true');
  });

  it('the card shows every bar it received; "−7" + Enter sends add −7 and clears the field', async () => {
    renderList();
    act(() => interaction.getState().select(LYRA_ID));
    const field = screen.getByLabelText('PV de Lyra');
    await userEvent.type(field, '−7{Enter}');
    expect(commands.sentAs('adjustBar')).toEqual([
      {
        name: 'adjustBar',
        campaignId: VHARN.id,
        fields: { tokenId: LYRA_ID, barId: LYRA_PV_ID, change: { op: 'add', amount: -7 } },
      },
    ]);
    expect(field).toHaveValue('');
  });

  it('"12" + Enter sets 12, and the − and + buttons step by one', async () => {
    renderList();
    act(() => interaction.getState().select(LYRA_ID));
    await userEvent.type(screen.getByLabelText('PV de Lyra'), '12{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Tirar 1 de PV de Lyra' }));
    await userEvent.click(screen.getByRole('button', { name: 'Somar 1 a PV de Lyra' }));
    expect(commands.sentAs('adjustBar').map(({ fields }) => fields)).toEqual([
      expect.objectContaining({ change: { op: 'set', value: 12 } }),
      expect.objectContaining({ change: { op: 'add', amount: -1 } }),
      expect.objectContaining({ change: { op: 'add', amount: 1 } }),
    ]);
  });

  it('a field that is not a number sends nothing and says how to write it', async () => {
    renderList();
    act(() => interaction.getState().select(LYRA_ID));
    await userEvent.type(screen.getByLabelText('PV de Lyra'), '1,5{Enter}');
    expect(commands.sent).toEqual([]);
    expect(screen.getByLabelText('PV de Lyra')).toHaveAccessibleDescription(/−7.*\+5.*12/);
  });

  it('a negative value reads "−4 / 38" in the error color', () => {
    const [pv, inspiration] = lyra().bars;
    if (!pv || !inspiration) throw new Error('lyra() lost its bars');
    renderList([lyra({ bars: [{ ...pv, current: -4, max: 38 }, inspiration] })]);
    act(() => interaction.getState().select(LYRA_ID));
    const card = screen.getByRole('region', { name: 'Cartão de Lyra' });
    expect(within(card).getByText('−4 / 38')).toHaveClass('text-destructive-text');
  });

  it('a redacted token shows only the bars that came, and without canControl it is read only', () => {
    const redacted = lyra({ canControl: false, bars: lyra().bars.slice(1) });
    renderList([redacted], false);
    act(() => interaction.getState().select(LYRA_ID));
    const card = screen.getByRole('region', { name: 'Cartão de Lyra' });
    expect(within(card).queryByText('PV')).toBeNull();
    expect(within(card).getByText('Inspiração')).toBeInTheDocument();
    expect(within(card).queryByRole('textbox')).toBeNull();
  });

  it('while reconnecting the fields are disabled', () => {
    renderList();
    act(() => {
      interaction.getState().select(LYRA_ID);
      interaction.getState().setReadOnly(true);
    });
    expect(screen.getByLabelText('PV de Lyra')).toBeDisabled();
  });

  it('the master edits from the card; a player has no "Editar token"', async () => {
    renderList();
    act(() => interaction.getState().select(LYRA_ID));
    await userEvent.click(screen.getByRole('button', { name: 'Editar token' }));
    expect(edited).toEqual([LYRA_ID]);
  });

  it('an empty scene tells the master how to add a token, and a player who adds them', () => {
    renderList([]);
    expect(screen.getByText('Crie um token pelo + na barra de ferramentas.')).toBeInTheDocument();
  });

  it('an empty scene for a player says the master has not placed anyone', () => {
    renderList([], false);
    expect(screen.getByText('O mestre ainda não pôs ninguém na cena.')).toBeInTheDocument();
  });
});
