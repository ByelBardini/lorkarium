import type { BoardStateDto, TokenDto } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { combatRecapOf, type RecapFrame } from '@/lib/combat-recap';
import {
  KAEL_COMBATANT,
  LYRA_COMBATANT,
  activeCondition,
  kael,
  lyra,
  vharnBoard,
  vharnCombat,
} from '../support/table-session-fixtures';

const KAEL = kael({ id: 'kael-token' });
const POISONED = lyra({ conditions: [activeCondition({ remainingRounds: 1 })] });
const CURED = lyra({ conditions: [] });
const TOKENS = [KAEL, POISONED];

function frame(board: BoardStateDto | null, snapshots = 1): RecapFrame {
  return { board, snapshots };
}

function at(round: number, current: string, tokens: readonly TokenDto[] = TOKENS): RecapFrame {
  return frame(
    vharnBoard({
      tokens: [...tokens],
      combat: vharnCombat({ round, currentCombatantId: current }),
    }),
  );
}

describe('combatRecapOf', () => {
  it('the turn closing round 2 reads "Rodada 3 começou."', () => {
    const recap = combatRecapOf(at(2, LYRA_COMBATANT), at(3, KAEL_COMBATANT), TOKENS);

    expect(recap).toEqual(['Rodada 3 começou.']);
  });

  it('Envenenado gone from the Lyra on the change of turn reads "Envenenado acabou em Lyra."', () => {
    const recap = combatRecapOf(at(2, LYRA_COMBATANT), at(2, KAEL_COMBATANT, [KAEL, CURED]), [
      KAEL,
      CURED,
    ]);

    expect(recap).toEqual(['Envenenado acabou em Lyra.']);
  });

  it('a token this viewer does not see is not named: its line does not appear', () => {
    const recap = combatRecapOf(at(2, LYRA_COMBATANT), at(3, KAEL_COMBATANT, [KAEL, CURED]), [
      KAEL,
    ]);

    expect(recap).toEqual(['Rodada 3 começou.']);
  });

  it.each([
    [3, 'Combate encerrado depois de 3 rodadas.'],
    [1, 'Combate encerrado depois de 1 rodada.'],
  ])('a combat ended in round %i reads "%s"', (round, text) => {
    const ended = frame(vharnBoard({ tokens: TOKENS, combat: null }));

    expect(combatRecapOf(at(round, KAEL_COMBATANT), ended, TOKENS)).toEqual([text]);
  });

  it('a turn that moves with nothing to tell is an empty recap', () => {
    const quiet = [KAEL, CURED];

    expect(
      combatRecapOf(at(2, KAEL_COMBATANT, quiet), at(2, LYRA_COMBATANT, quiet), quiet),
    ).toEqual([]);
  });

  it('a snapshot is no news (null), even with another round', () => {
    const snapshot = { ...at(3, KAEL_COMBATANT), snapshots: 2 };

    expect(combatRecapOf(at(2, LYRA_COMBATANT), snapshot, TOKENS)).toBeNull();
  });

  it('the same turn (an initiative changed) is no news', () => {
    expect(combatRecapOf(at(2, KAEL_COMBATANT), at(2, KAEL_COMBATANT), TOKENS)).toBeNull();
  });

  it('no combat before is no news', () => {
    expect(combatRecapOf(frame(vharnBoard()), at(1, KAEL_COMBATANT), TOKENS)).toBeNull();
  });
});
