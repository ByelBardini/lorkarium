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
  BIA_AT_TABLE,
  KAEL_COMBATANT,
  LYRA_COMBATANT,
  LYRA_ID,
  lyra,
  soloCombatant,
  VHARN_SCENE,
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

  // Only the entries: the tokens of a group are list items nested inside them.
  function rows(): HTMLElement[] {
    const order = screen.getByRole('list', { name: 'Ordem de iniciativa' });
    return within(order)
      .getAllByRole('listitem')
      .filter((item) => item.parentElement === order);
  }

  async function chooseFrom(menu: string, item: string): Promise<void> {
    await userEvent.click(screen.getByRole('button', { name: menu }));
    await userEvent.click(await screen.findByRole('menuitem', { name: item }));
  }

  const withGoblin = (initiative: number | null, lyraInitiative = 14) =>
    vharnCombat({
      combatants: [
        soloCombatant(KAEL_COMBATANT, 'kael-token', 18, 0),
        soloCombatant(LYRA_COMBATANT, LYRA_ID, lyraInitiative, 1),
        soloCombatant(GOBLIN_COMBATANT, 'goblin-token', initiative, 2),
      ],
    });

  it('the rows follow the order of the combat, and the one on turn is aria-current', () => {
    renderList(withGoblin(-2));
    expect(
      rows().map((row) => within(row).getAllByRole('button', { expanded: false })[0]?.textContent),
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

  it('a player sees no ↑/↓ nor the menus of the entries', () => {
    renderList(withGoblin(-2, 18), false);
    expect(screen.queryByRole('button', { name: /no empate$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Mais ações/ })).toBeNull();
  });

  it('"Tirar do combate" and "Adicionar ao combate" (with the tokens still out of it)', async () => {
    renderList();
    await chooseFrom('Mais ações de Lyra', 'Tirar do combate');
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
      [
        'addCombatants',
        {
          entries: [
            { name: null, tokenIds: ['goblin-token'] },
            { name: null, tokenIds: ['ogro-token'] },
          ],
        },
      ],
    ]);
  });

  it('"Adicionar ao combate" offers only the tokens of the Tokens layer still out of it', async () => {
    renderList(vharnCombat(), true, [
      KAEL,
      lyra(),
      GOBLIN,
      lyra({ id: 'bau', name: 'Baú', layer: 'objects' }),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar ao combate' }));

    const dialog = screen.getByRole('dialog', { name: 'Adicionar ao combate' });
    expect(
      within(dialog)
        .getAllByRole('checkbox')
        .map((box) => box.closest('li')?.textContent),
    ).toEqual(['Goblin']);
  });

  it('"Entrar em: Lyra" sends the token into that entry with regroupTokens', async () => {
    renderList();

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar ao combate' }));
    const dialog = screen.getByRole('dialog', { name: 'Adicionar ao combate' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Ogro' }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Lyra' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar' }));

    expect(commands.sentAs('regroupTokens').map(({ fields }) => fields)).toEqual([
      { tokenIds: ['goblin-token'], target: { kind: 'entry', combatantId: LYRA_COMBATANT } },
    ]);
  });

  it('"+ Entrada sem token" named Covil sends addCombatants with no token', async () => {
    renderList();

    await userEvent.click(screen.getByRole('button', { name: 'Entrada sem token' }));
    const create = screen.getByRole('button', { name: 'Criar entrada' });
    expect(create).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Nome da entrada'), 'Covil');
    await userEvent.click(create);

    expect(commands.sentAs('addCombatants').map(({ fields }) => fields)).toEqual([
      { entries: [{ name: 'Covil', tokenIds: [] }] },
    ]);
  });

  it('a player sees no "+ Entrada sem token"', () => {
    renderList(vharnCombat(), false);

    expect(screen.queryByRole('button', { name: 'Entrada sem token' })).toBeNull();
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
    expect(screen.getByRole('button', { name: 'Mais ações de Kael' })).toBeDisabled();
  });

  it('a defeated token reads as dead in its row, and a living one does not', () => {
    renderList(withGoblin(3), true, [KAEL, lyra(), { ...GOBLIN, defeated: true }, OGRO]);

    expect(screen.getByRole('button', { name: 'Goblin, morto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kael' })).toBeInTheDocument();
  });

  describe('grouped entries', () => {
    const INIMIGOS = 'c1f2e3d4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
    const GIGANTE = 'c2a3b4c5-d6e7-4f8a-9b0c-1d2e3f4a5b6c';
    const COVIL = 'c3b4c5d6-e7f8-4a9b-8c0d-2e3f4a5b6c7d';
    const LOBO = lyra({ id: 'lobo-token', name: 'Lobo', canControl: true });
    const GIGANTE_TOKEN = lyra({ id: 'gigante-token', name: 'Gigante' });
    const TOKENS = [KAEL, GOBLIN, LOBO, GIGANTE_TOKEN];

    function grouped(overrides: Partial<CombatDto> = {}): CombatDto {
      return vharnCombat({
        currentCombatantId: INIMIGOS,
        combatants: [
          {
            ...soloCombatant(INIMIGOS, 'goblin-token', 15, 0),
            name: 'Inimigos',
            tokenIds: ['lobo-token', 'goblin-token'],
          },
          soloCombatant(KAEL_COMBATANT, 'kael-token', 12, 1),
          soloCombatant(GIGANTE, 'gigante-token', 10, 2),
          { ...soloCombatant(COVIL, 'x', 5, 3), name: 'Covil', tokenIds: [] },
        ],
        ...overrides,
      });
    }

    it('Inimigos shows Goblin and Lobo under it, by name, and the entry on turn is aria-current', () => {
      renderList(grouped(), true, TOKENS);

      const inimigos = rows()[0] as HTMLElement;
      expect(inimigos).toHaveAttribute('aria-current', 'true');
      const tokens = within(inimigos).getByRole('list', { name: 'Tokens de Inimigos' });
      expect(
        within(tokens)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([expect.stringContaining('Goblin'), expect.stringContaining('Lobo')]);
    });

    it('one defeated Goblin reads as dead under Inimigos, and the entry stays alive', () => {
      renderList(grouped(), true, [KAEL, { ...GOBLIN, defeated: true }, LOBO, GIGANTE_TOKEN]);

      expect(screen.getByRole('button', { name: 'Goblin, morto' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Lobo' })).toBeInTheDocument();
      expect(within(rows()[0] as HTMLElement).queryByText(/todos mortos/)).toBeNull();
    });

    it('with Goblin and Lobo defeated, Inimigos reads as all dead', () => {
      const fallen = { defeated: true };
      renderList(grouped(), true, [KAEL, { ...GOBLIN, ...fallen }, { ...LOBO, ...fallen }]);

      expect(within(rows()[0] as HTMLElement).getByText(', todos mortos')).toBeInTheDocument();
    });

    it('picking Goblin selects the token and opens its card; the Covil has no card', async () => {
      renderList(grouped(), true, TOKENS);

      await userEvent.click(screen.getByRole('button', { name: 'Goblin' }));

      expect(interaction.getState().selectedTokenIds).toEqual(['goblin-token']);
      expect(screen.getByRole('region', { name: 'Cartão de Goblin' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Covil' })).toBeNull();
    });

    it('"Renomear" opens the name, and Enter sends renameCombatant', async () => {
      renderList(grouped(), true, TOKENS);

      await chooseFrom('Mais ações de Inimigos', 'Renomear');
      const field = screen.getByLabelText('Nome de Inimigos');
      expect(field).toHaveValue('Inimigos');
      await userEvent.clear(field);
      await userEvent.type(field, 'Goblins{Enter}');

      expect(commands.sentAs('renameCombatant').map(({ fields }) => fields)).toEqual([
        { combatantId: INIMIGOS, name: 'Goblins' },
      ]);
    });

    it('Esc closes the name without sending, and an empty name is not sent', async () => {
      renderList(grouped(), true, TOKENS);

      await chooseFrom('Mais ações de Inimigos', 'Renomear');
      await userEvent.type(screen.getByLabelText('Nome de Inimigos'), 'x{Escape}');
      expect(screen.queryByLabelText('Nome de Inimigos')).toBeNull();
      await chooseFrom('Mais ações de Inimigos', 'Renomear');
      await userEvent.clear(screen.getByLabelText('Nome de Inimigos'));
      await userEvent.keyboard('{Enter}');

      expect(commands.sentAs('renameCombatant')).toEqual([]);
    });

    it('"Tirar do combate" in the entry menu sends removeCombatant', async () => {
      renderList(grouped(), true, TOKENS);

      await chooseFrom('Mais ações de Inimigos', 'Tirar do combate');

      expect(commands.sentAs('removeCombatant').map(({ fields }) => fields)).toEqual([
        { combatantId: INIMIGOS },
      ]);
    });

    it('"Separar" gives the Goblin an entry of its own', async () => {
      renderList(grouped(), true, TOKENS);

      await chooseFrom('Mais ações de Goblin', 'Separar');

      expect(commands.sentAs('regroupTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: ['goblin-token'], target: { kind: 'own' } },
      ]);
    });

    it('"Mover para" › Gigante sends the Goblin into that entry', async () => {
      renderList(grouped(), true, TOKENS);

      await chooseFrom('Mais ações de Goblin', 'Mover para');
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Gigante' }));

      expect(commands.sentAs('regroupTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: ['goblin-token'], target: { kind: 'entry', combatantId: GIGANTE } },
      ]);
    });

    it('"Tirar do combate" in the token menu takes only the Goblin out', async () => {
      renderList(grouped(), true, TOKENS);

      await chooseFrom('Mais ações de Goblin', 'Tirar do combate');

      expect(commands.sentAs('regroupTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: ['goblin-token'], target: { kind: 'out' } },
      ]);
    });

    it('a named entry of one token lists it, and the token menu has no "Separar"', async () => {
      const combat = grouped();
      const renamed = combat.combatants.map((entry) =>
        entry.id === GIGANTE ? { ...entry, name: 'Chefe' } : entry,
      );
      renderList({ ...combat, combatants: renamed }, true, TOKENS);

      await userEvent.click(screen.getByRole('button', { name: 'Mais ações de Gigante' }));

      expect(await screen.findByRole('menuitem', { name: 'Tirar do combate' })).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'Separar' })).toBeNull();
    });

    it('a player who controls every token of Inimigos edits its initiative, and sees no menu', () => {
      const goblin = { ...GOBLIN, canControl: true };
      renderList(grouped(), false, [KAEL, goblin, LOBO, GIGANTE_TOKEN]);

      expect(screen.getByLabelText('Iniciativa de Inimigos')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Mais ações/ })).toBeNull();
    });

    it('a player missing control of one token of Inimigos only reads its initiative', () => {
      renderList(grouped(), false, TOKENS);

      expect(screen.queryByLabelText('Iniciativa de Inimigos')).toBeNull();
      expect(rows()[0]).toHaveTextContent('15');
    });

    it('while reconnecting the menus of the tokens are disabled too', () => {
      renderList(grouped(), true, TOKENS);
      act(() => interaction.getState().setReadOnly(true));

      expect(screen.getByRole('button', { name: 'Mais ações de Goblin' })).toBeDisabled();
    });
  });

  it('the tracker of Bia never names the goblin she does not see', () => {
    const bia = lyra({ sight: { bright: 3, dim: 3 } });
    const hidden = { ...GOBLIN, col: 15, row: 4 };
    board.getState().apply({
      kind: 'board',
      state: vharnBoard({
        viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
        scene: { ...VHARN_SCENE, vision: 'dark' },
        tokens: [bia, hidden],
        combat: vharnCombat({
          currentCombatantId: GOBLIN_COMBATANT,
          combatants: [
            soloCombatant(GOBLIN_COMBATANT, 'goblin-token', 15, 0),
            soloCombatant(LYRA_COMBATANT, LYRA_ID, 14, 1),
          ],
        }),
      }),
    });
    render(
      <CombatantList
        board={board}
        interaction={interaction}
        isMaster={false}
        onEditToken={() => undefined}
      />,
    );

    expect(rows()[0]).toHaveTextContent('Fora de vista');
    expect(screen.getByRole('list', { name: 'Ordem de iniciativa' })).not.toHaveTextContent(
      'Goblin',
    );
  });
});
