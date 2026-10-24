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
import { createTablePresenceStore, type TablePresenceStore } from '@/stores/table-presence-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  ANA_AT_TABLE,
  BIA_AT_TABLE,
  KAEL_COMBATANT,
  LYRA_COMBATANT,
  LYRA_ID,
  activeCondition,
  lyra,
  soloCombatant,
  VHARN_SCENE,
  vharnBoard,
  vharnCombat,
  VHARN_GRID,
} from '../../support/table-session-fixtures';

const GOBLIN_COMBATANT = 'c9e8d7c6-b5a4-4f3e-8d2c-1b0a9f8e7d6c';
const KAEL = lyra({ id: 'kael-token', name: 'Kael', canControl: true, bars: [] });
const GOBLIN = lyra({ id: 'goblin-token', name: 'Goblin', canControl: false, controllerIds: [] });
const OGRO = lyra({ id: 'ogro-token', name: 'Ogro' });

describe('CombatantList', () => {
  let board: StoreApi<BoardStore>;
  let presence: StoreApi<TablePresenceStore>;
  let interaction: StoreApi<BoardInteractionStore>;
  let commands: TableBoardCommandsFake;

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
  });

  function show(combat: CombatDto, tokens: readonly TokenDto[]): void {
    board.getState().apply({ kind: 'board', state: vharnBoard({ tokens: [...tokens], combat }) });
  }

  function renderList(
    combat: CombatDto = vharnCombat(),
    isMaster = true,
    tokens: readonly TokenDto[] = [KAEL, lyra(), GOBLIN, OGRO],
  ): void {
    show(combat, tokens);
    render(
      <CombatantList
        board={board}
        presence={presence}
        interaction={interaction}
        isMaster={isMaster}
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

  describe('the line of an entry', () => {
    it('the rows follow the order of the combat, and the one on turn is aria-current', () => {
      renderList(withGoblin(-2));

      expect(
        rows().map((row) => within(row).getAllByText(/^(Kael|Lyra|Goblin)$/)[0]?.textContent),
      ).toEqual(['Kael', 'Lyra', 'Goblin']);
      expect(rows()[0]).toHaveAttribute('aria-current', 'true');
      expect(rows()[1]).not.toHaveAttribute('aria-current');
    });

    it('for whoever only reads it, the initiative of the one on turn is a gold box', () => {
      renderList(withGoblin(-2), false, [KAEL, lyra({ canControl: false }), GOBLIN]);

      expect(within(rows()[1] as HTMLElement).getByText('14')).not.toHaveClass('bg-primary');
      expect(within(rows()[2] as HTMLElement).getByText('−2')).not.toHaveClass('bg-primary');
      act(() =>
        show(vharnCombat({ ...withGoblin(-2), currentCombatantId: LYRA_COMBATANT }), [
          KAEL,
          lyra({ canControl: false }),
          GOBLIN,
        ]),
      );
      expect(within(rows()[1] as HTMLElement).getByText('14')).toHaveClass('bg-primary');
    });

    it('a combatant without initiative shows "—"', () => {
      renderList(withGoblin(null), false);

      expect(rows()[2]).toHaveTextContent('—');
    });

    it('who plays reads "jogado por Bia", and a token nobody plays reads "NPC"', () => {
      renderList(withGoblin(3));

      expect(rows()[1]).toHaveTextContent('jogado por Bia');
      expect(rows()[2]).toHaveTextContent('NPC');
    });

    it('the first bar shows as "32 / 45" with its track, only when it came', () => {
      renderList(withGoblin(3), true, [KAEL, lyra(), { ...GOBLIN, bars: [] }]);

      expect(screen.getByRole('meter', { name: 'PV de Lyra' })).toHaveAttribute(
        'aria-valuetext',
        '32 / 45',
      );
      expect(within(rows()[2] as HTMLElement).queryByRole('meter')).toBeNull();
    });

    it('a bar hidden from this viewer (it did not come) shows nothing', () => {
      const redacted = lyra({ bars: lyra().bars.filter(({ position }) => position !== 0) });
      renderList(withGoblin(3), false, [KAEL, redacted, GOBLIN]);

      expect(within(rows()[1] as HTMLElement).queryByRole('meter')).toBeNull();
    });

    it('the conditions show as tags read with their rounds, or "sem limite"', () => {
      const conditions = [
        activeCondition({ remainingRounds: 2 }),
        activeCondition({
          id: 'blessed',
          name: 'Abençoado',
          tone: 'benefit',
          remainingRounds: null,
        }),
      ];
      renderList(withGoblin(3), true, [KAEL, lyra({ conditions }), GOBLIN]);

      const tags = within(screen.getByRole('list', { name: 'Condições de Lyra' }));
      expect(tags.getAllByRole('listitem').map((tag) => tag.textContent)).toEqual([
        'Envenenado2, 2 rodadas',
        'Abençoado∞, sem limite',
      ]);
    });

    it('a defeated token reads as dead and is struck, a living one is not', () => {
      renderList(withGoblin(3), true, [KAEL, lyra(), { ...GOBLIN, defeated: true }, OGRO]);

      expect(screen.getByRole('button', { name: /^Goblin, morto/ })).toBeInTheDocument();
      expect(screen.getByText('Goblin')).toHaveClass('line-through');
      expect(screen.getByText('Kael')).not.toHaveClass('line-through');
    });

    it('picking a line selects the token, and no card opens inside the line', async () => {
      renderList();

      await userEvent.click(screen.getByRole('button', { name: /^Lyra/ }));

      expect(interaction.getState().selectedTokenIds).toEqual([LYRA_ID]);
      expect(screen.getByRole('button', { name: /^Lyra/ })).toHaveAttribute('aria-pressed', 'true');
      expect(within(rows()[1] as HTMLElement).queryByRole('region')).toBeNull();
    });
  });

  describe('initiative, ties and menus', () => {
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

    it('"Tirar do combate" sends removeCombatant, and the list offers no "Adicionar ao combate"', async () => {
      renderList();

      await chooseFrom('Mais ações de Lyra', 'Tirar do combate');

      expect(commands.sent.map(({ name, fields }) => [name, fields])).toEqual([
        ['removeCombatant', { combatantId: LYRA_COMBATANT }],
      ]);
      expect(screen.queryByRole('button', { name: 'Adicionar ao combate' })).toBeNull();
    });

    it('while reconnecting the fields and buttons are disabled', () => {
      renderList();

      act(() => interaction.getState().setReadOnly(true));

      expect(screen.getByLabelText('Iniciativa de Kael')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Mais ações de Kael' })).toBeDisabled();
    });
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

    it('Inimigos, on turn, is open with Goblin and Lobo under it, by name', () => {
      renderList(grouped(), true, TOKENS);

      const inimigos = rows()[0] as HTMLElement;
      expect(inimigos).toHaveAttribute('aria-current', 'true');
      expect(within(inimigos).getByRole('button', { name: /^Inimigos/ })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
      const tokens = within(inimigos).getByRole('list', { name: 'Tokens de Inimigos' });
      expect(
        within(tokens)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([expect.stringContaining('Goblin'), expect.stringContaining('Lobo')]);
    });

    it('one defeated Goblin reads as dead under Inimigos, and the entry stays alive', () => {
      renderList(grouped(), true, [KAEL, { ...GOBLIN, defeated: true }, LOBO, GIGANTE_TOKEN]);

      expect(screen.getByRole('button', { name: /^Goblin, morto/ })).toBeInTheDocument();
      expect(within(rows()[0] as HTMLElement).getByText('1 de 2 de pé')).toBeInTheDocument();
      expect(within(rows()[0] as HTMLElement).queryByText(/todos mortos/)).toBeNull();
    });

    it('with Goblin and Lobo defeated, Inimigos reads as all dead', () => {
      const fallen = { defeated: true };
      renderList(grouped(), true, [KAEL, { ...GOBLIN, ...fallen }, { ...LOBO, ...fallen }]);

      expect(within(rows()[0] as HTMLElement).getByText(', todos mortos')).toBeInTheDocument();
    });

    it('picking Goblin selects the token; the Covil, without tokens, has its mark and nothing to pick', async () => {
      renderList(grouped(), true, TOKENS);

      await userEvent.click(screen.getByRole('button', { name: /^Goblin/ }));

      expect(interaction.getState().selectedTokenIds).toEqual(['goblin-token']);
      expect(screen.queryByRole('button', { name: /^Covil/ })).toBeNull();
      expect(rows()[3]).toHaveTextContent('Covil');
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

    it.each([
      ['Separar', { kind: 'own' }],
      ['Tirar do combate', { kind: 'out' }],
    ])('"%s" in the menu of the Goblin regroups only it', async (item, target) => {
      renderList(grouped(), true, TOKENS);

      await chooseFrom('Mais ações de Goblin', item);

      expect(commands.sentAs('regroupTokens').map(({ fields }) => fields)).toEqual([
        { tokenIds: ['goblin-token'], target },
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

    it('a named entry of one token is a group: opened, its token menu has no "Separar"', async () => {
      const combat = grouped();
      const renamed = combat.combatants.map((entry) =>
        entry.id === GIGANTE ? { ...entry, name: 'Chefe' } : entry,
      );
      renderList({ ...combat, combatants: renamed }, true, TOKENS);

      await userEvent.click(screen.getByRole('button', { name: /^Chefe/ }));
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

  describe('a group that folds', () => {
    const BANDIDO = 'c4c5d6e7-f8a9-4b0c-9d1e-3f4a5b6c7d8e';
    const pv = lyra().bars[0];
    const BANDITS = [1, 2, 3, 4, 5, 6].map((n) =>
      lyra({
        id: `bandido-${n}`,
        name: `Bandido ${n}`,
        side: 'enemy',
        controllerIds: [],
        canControl: false,
        defeated: n === 6,
        bars: pv ? [{ ...pv, id: `pv-${n}`, current: 5, max: 10 }] : [],
      }),
    );
    const TOKENS = [KAEL, ...BANDITS];

    function bandits(current: string): CombatDto {
      return vharnCombat({
        currentCombatantId: current,
        combatants: [
          soloCombatant(KAEL_COMBATANT, 'kael-token', 18, 0),
          {
            ...soloCombatant(BANDIDO, 'bandido-1', 14, 1),
            name: 'Bandido',
            tokenIds: BANDITS.map(({ id }) => id),
          },
        ],
      });
    }

    const header = () => screen.getByRole('button', { name: /^Bandido×6/ });

    it('"Bandido ×6 · 5 de 6 de pé", folded while it is not its turn, with the bars added up', () => {
      renderList(bandits(KAEL_COMBATANT), true, TOKENS);

      expect(header()).toHaveAttribute('aria-expanded', 'false');
      expect(rows()[1]).toHaveTextContent('5 de 6 de pé');
      expect(screen.getByRole('meter', { name: 'Barras de Bandido' })).toHaveAttribute(
        'aria-valuetext',
        '30 / 60',
      );
      expect(screen.queryByRole('list', { name: 'Tokens de Bandido' })).toBeNull();
    });

    it('opening it lists each bandit with its bar', async () => {
      renderList(bandits(KAEL_COMBATANT), true, TOKENS);

      await userEvent.click(header());

      const members = screen.getByRole('list', { name: 'Tokens de Bandido' });
      expect(within(members).getAllByRole('listitem')).toHaveLength(6);
      expect(within(members).getByRole('meter', { name: 'PV de Bandido 1' })).toBeInTheDocument();
    });

    it('when the turn comes to it, it opens by itself', () => {
      renderList(bandits(KAEL_COMBATANT), true, TOKENS);

      act(() => show(bandits(BANDIDO), TOKENS));

      expect(header()).toHaveAttribute('aria-expanded', 'true');
    });

    it('folded by hand on its turn, it stays folded until the next turn, then follows it again', async () => {
      renderList(bandits(BANDIDO), true, TOKENS);

      await userEvent.click(header());
      expect(header()).toHaveAttribute('aria-expanded', 'false');
      act(() => show({ ...bandits(BANDIDO), round: 2 }, TOKENS));

      expect(header()).toHaveAttribute('aria-expanded', 'true');
    });

    it('a bandit this viewer does not see neither shows nor adds up', () => {
      const eye = lyra({ id: 'kael-token', name: 'Kael', sight: { bright: 3, dim: 3 } });
      const far = BANDITS.map((token, index) => (index === 0 ? { ...token, col: 15 } : token));
      board.getState().apply({
        kind: 'board',
        state: vharnBoard({
          viewer: { userId: BIA_AT_TABLE.userId, role: 'player' },
          scene: { ...VHARN_SCENE, vision: 'dark' },
          tokens: [eye, ...far.map((token) => ({ ...token, col: token.col === 15 ? 15 : 3 }))],
          combat: bandits(BANDIDO),
        }),
      });
      render(
        <CombatantList
          board={board}
          presence={presence}
          interaction={interaction}
          isMaster={false}
        />,
      );

      const members = screen.getByRole('list', { name: 'Tokens de Bandido' });
      expect(within(members).getAllByRole('listitem')).toHaveLength(5);
      expect(members).not.toHaveTextContent('Bandido 1');
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
        presence={presence}
        interaction={interaction}
        isMaster={false}
      />,
    );

    expect(rows()[0]).toHaveTextContent('Fora de vista');
    expect(screen.getByRole('list', { name: 'Ordem de iniciativa' })).not.toHaveTextContent(
      'Goblin',
    );
  });
});
