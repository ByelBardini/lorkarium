import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CombatDto, TokenDto } from '@lorkarium/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { CombatantList } from '@/features/combat/combatant-list';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  KAEL_COMBATANT,
  LYRA_COMBATANT,
  LYRA_ID,
  lyra,
  vharnBoard,
  vharnCombat,
} from '../../support/table-session-fixtures';

const GOBLIN_COMBATANT = 'c9e8d7c6-b5a4-4f3e-8d2c-1b0a9f8e7d6c';
const KAEL = lyra({ id: 'kael-token', name: 'Kael', canControl: true });
const GOBLIN = lyra({ id: 'goblin-token', name: 'Goblin', canControl: false });
const OGRO = lyra({ id: 'ogro-token', name: 'Ogro' });

describe('CombatantList', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    commands = new TableBoardCommandsFake();
    interaction = createBoardInteractionStore({
      campaignId: VHARN.id,
      commands,
      describeRefusal: String,
    });
  });

  function renderList(
    combat: CombatDto = vharnCombat(),
    isMaster = true,
    tokens: TokenDto[] = [KAEL, lyra(), GOBLIN, OGRO],
  ): void {
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens, combat }) });
    render(
      <CombatantList
        board={board}
        interaction={interaction}
        isMaster={isMaster}
        onEditToken={() => undefined}
      />,
    );
  }

  function rows(): HTMLElement[] {
    return within(screen.getByRole('list', { name: 'Ordem de iniciativa' })).getAllByRole(
      'listitem',
    );
  }

  const withGoblin = (initiative: number | null, lyraInitiative = 14) =>
    vharnCombat({
      combatants: [
        { id: KAEL_COMBATANT, tokenId: 'kael-token', initiative: 18, tieOrder: 0 },
        { id: LYRA_COMBATANT, tokenId: LYRA_ID, initiative: lyraInitiative, tieOrder: 1 },
        { id: GOBLIN_COMBATANT, tokenId: 'goblin-token', initiative, tieOrder: 2 },
      ],
    });

  it('the rows follow the order of the combat, and the one on turn is aria-current', () => {
    renderList(withGoblin(-2));
    expect(
      rows().map((row) => within(row).getByRole('button', { expanded: false }).textContent),
    ).toEqual(['Kael', 'Lyra', 'Goblin']);
    expect(rows()[0]).toHaveAttribute('aria-current', 'true');
    expect(rows()[1]).not.toHaveAttribute('aria-current');
  });

  it('a negative initiative shows the minus', () => {
    renderList(withGoblin(-2), false);
    expect(rows()[2]).toHaveTextContent('−2');
  });

  it('a combatant without initiative shows "—" at the end', () => {
    renderList(withGoblin(null), false);
    expect(rows()[2]).toHaveTextContent('—');
  });

  it('"Iniciativa de Kael" sends the number on Enter, and an empty field sends null', async () => {
    renderList();
    const field = screen.getByLabelText('Iniciativa de Kael');
    await userEvent.clear(field);
    await userEvent.type(field, '20{Enter}');
    await userEvent.clear(screen.getByLabelText('Iniciativa de Kael'));
    await userEvent.tab();
    expect(commands.sentAs('setInitiative').map(({ fields }) => fields)).toEqual([
      { combatantId: KAEL_COMBATANT, initiative: 20 },
      { combatantId: KAEL_COMBATANT, initiative: null },
    ]);
  });

  it('a refused initiative puts the confirmed value back', async () => {
    commands.answerWith({ ok: false, failure: 'forbidden' });
    renderList();
    const field = screen.getByLabelText('Iniciativa de Kael');
    await userEvent.clear(field);
    await userEvent.type(field, '3{Enter}');
    expect(screen.getByLabelText('Iniciativa de Kael')).toHaveValue('18');
    expect(interaction.getState().notice).toBe('forbidden');
  });

  it('a player only edits the initiative of the tokens they control', () => {
    renderList(withGoblin(-2), false);
    expect(screen.getByLabelText('Iniciativa de Kael')).toBeInTheDocument();
    expect(screen.queryByLabelText('Iniciativa de Goblin')).toBeNull();
  });

  it('↑ and ↓ appear only between tied combatants, and send moveInTie', async () => {
    renderList(withGoblin(-2, 18));
    expect(screen.queryByRole('button', { name: 'Subir Goblin no empate' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Subir Lyra no empate' }));
    expect(commands.sentAs('moveInTie').map(({ fields }) => fields)).toEqual([
      { combatantId: LYRA_COMBATANT, direction: 'up' },
    ]);
    expect(screen.getByRole('button', { name: 'Descer Kael no empate' })).toBeInTheDocument();
  });

  it('a player sees no ↑/↓ nor "Tirar do combate"', () => {
    renderList(withGoblin(-2, 18), false);
    expect(screen.queryByRole('button', { name: /no empate$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /do combate$/ })).toBeNull();
  });

  it('"Tirar do combate" and "Adicionar ao combate" (with the tokens still out of it)', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Tirar Lyra do combate' }));
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar ao combate' }));
    const dialog = screen.getByRole('dialog', { name: 'Adicionar ao combate' });
    expect(
      within(dialog)
        .getAllByRole('checkbox')
        .map((box) => box.closest('li')?.textContent),
    ).toEqual(['Goblin', 'Ogro']);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));
    expect(commands.sent.map(({ name, fields }) => [name, fields])).toEqual([
      ['removeCombatant', { combatantId: LYRA_COMBATANT }],
      ['addCombatants', { tokenIds: ['goblin-token', 'ogro-token'] }],
    ]);
  });

  it('opening a row shows the card of the token', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: 'Lyra' }));
    expect(screen.getByRole('region', { name: 'Cartão de Lyra' })).toBeInTheDocument();
  });

  it('while reconnecting the fields and buttons are disabled', () => {
    renderList();
    act(() => interaction.getState().setReadOnly(true));
    expect(screen.getByLabelText('Iniciativa de Kael')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tirar Kael do combate' })).toBeDisabled();
  });
});
