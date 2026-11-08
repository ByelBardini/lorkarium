import type { BoardStateDto } from '@lorkarium/contracts';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { StoreApi } from 'zustand/vanilla';
import { useCombatRecap } from '@/features/combat/use-combat-recap';
import { TableSightOutlinesContext } from '@/features/board/table-sight-outlines';
import { useBoardKeyboard } from '@/features/board/use-board-keyboard';
import { useInteractionFollowsTable } from '@/features/board/use-interaction-follows-table';
import type { SightOutlines } from '@/lib/sight-geometry';
import {
  createBoardInteractionStore,
  type BoardInteractionStore,
} from '@/stores/board-interaction-store';
import { createBoardStore, type BoardStore } from '@/stores/board-store';
import { createSightOutlineStore, type SightOutlineStore } from '@/stores/sight-outline-store';
import { createTablePresenceStore } from '@/stores/table-presence-store';
import { AssetOutlineApiFake } from '../../support/asset-outline-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import {
  OGRE_ID,
  TOP_STRIP_OUTLINE,
  TRACED_ASSET_ID,
  blockerBoard,
  lookout,
  ogre,
  statue,
  tracedOutlines,
} from '../../support/sight-blocker-fixtures';
import { TableBoardCommandsFake } from '../../support/table-board-commands-fake';
import {
  KAEL_COMBATANT,
  LYRA_COMBATANT,
  VHARN_GRID,
  activeCondition,
  soloCombatant,
  vharnCombat,
  vharnState,
} from '../../support/table-session-fixtures';

// The statue blocks by its rectangle until the outline is known: only then Bia sees the ogre.
const TOKENS = [lookout(), statue({ imageAssetId: TRACED_ASSET_ID }), ogre()];

function roomWith(outlines: SightOutlines) {
  return ({ children }: Readonly<{ children: ReactNode }>) => (
    <TableSightOutlinesContext value={outlines}>{children}</TableSightOutlinesContext>
  );
}

function withCombat(board: BoardStateDto, currentCombatantId: string): BoardStateDto {
  return {
    ...board,
    combat: vharnCombat({
      currentCombatantId,
      combatants: [
        soloCombatant(KAEL_COMBATANT, OGRE_ID, 18, 0),
        soloCombatant(LYRA_COMBATANT, 'lyra-token', 14, 1),
      ],
    }),
  };
}

describe('the consumers of the filter read the outlines of the room', () => {
  let board: StoreApi<BoardStore>;
  let interaction: StoreApi<BoardInteractionStore>;

  beforeEach(() => {
    board = createBoardStore(VHARN.id, () => undefined);
    board.setState({ board: blockerBoard(TOKENS) });
    interaction = createBoardInteractionStore({
      scopeOf: () => VHARN_GRID,
      commands: new TableBoardCommandsFake(),
      describeRefusal: String,
    });
  });

  describe('the keys', () => {
    function KeyedBoard() {
      const onKeyDown = useBoardKeyboard({
        board,
        interaction,
        onOpen: () => undefined,
        onDeleteSelection: () => undefined,
      });
      return <button onKeyDown={onKeyDown}>tabuleiro</button>;
    }

    async function thirdStep(outlines: SightOutlines): Promise<readonly string[]> {
      const Room = roomWith(outlines);
      render(
        <Room>
          <KeyedBoard />
        </Room>,
      );
      screen.getByRole('button', { name: 'tabuleiro' }).focus();
      await userEvent.keyboard(']]]');
      return interaction.getState().selectedTokenIds;
    }

    it('] reaches the ogre when the outline lets him show', async () => {
      expect(await thirdStep(tracedOutlines(TOP_STRIP_OUTLINE))).toEqual([OGRE_ID]);
    });

    it('] does not reach the ogre behind the rectangle', async () => {
      expect(await thirdStep(new Map())).not.toContain(OGRE_ID);
    });
  });

  describe('the recap of the turn', () => {
    const POISON = activeCondition({ name: 'Envenenado' });

    function recapAfterTheTurn(outlines: SightOutlines): readonly string[] {
      const poisoned = [
        lookout(),
        statue({ imageAssetId: TRACED_ASSET_ID }),
        ogre({ conditions: [POISON] }),
      ];
      const before = withCombat(blockerBoard(poisoned), LYRA_COMBATANT);
      board.setState({ board: before });
      const wrapper = roomWith(outlines);
      const { result } = renderHook(() => useCombatRecap(board, interaction), { wrapper });
      act(() => board.setState({ board: withCombat(blockerBoard(TOKENS), KAEL_COMBATANT) }));
      return result.current.lines;
    }

    it('names the ogre the outline lets show', () => {
      expect(recapAfterTheTurn(tracedOutlines(TOP_STRIP_OUTLINE))).toEqual([
        'Envenenado acabou em Ogro.',
      ]);
    });

    it('does not name the ogre behind the rectangle', () => {
      expect(recapAfterTheTurn(new Map())).toEqual([]);
    });
  });

  describe('the announcement of the turn', () => {
    let store: StoreApi<SightOutlineStore>;

    async function announced(known: boolean): Promise<string | null> {
      const api = new AssetOutlineApiFake();
      api.answer(
        TRACED_ASSET_ID,
        [...TOP_STRIP_OUTLINE].map((polygon) => polygon.map(([x, y]) => [x, y])),
      );
      store = createSightOutlineStore(api);
      if (known) await store.getState().request([TRACED_ASSET_ID]);
      const presence = createTablePresenceStore(VHARN.id);
      presence.getState().apply({ kind: 'state', state: vharnState() });
      board.setState({ board: withCombat(blockerBoard(TOKENS), LYRA_COMBATANT) });
      renderHook(() =>
        useInteractionFollowsTable({ presence, board }, interaction, 'player', store),
      );
      act(() => board.setState({ board: withCombat(blockerBoard(TOKENS), KAEL_COMBATANT) }));
      return interaction.getState().notice;
    }

    it('names the ogre once the store of the room knows the outline', async () => {
      expect(await announced(true)).toBe('Vez de Ogro.');
    });

    it('does not name him before that', async () => {
      expect(await announced(false)).toBe('Vez de alguém fora de vista.');
    });
  });
});
