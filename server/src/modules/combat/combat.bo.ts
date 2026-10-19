import {
  advanceTurn,
  initiative,
  moveWithinTie,
  orderCombatants,
  retreatTurn,
  type AdvancedTurn,
  type TieDirection,
  type TurnState,
} from '@lorkarium/game-core';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { TokenAccessBo } from '../tokens/token-access.bo';
import {
  CombatNotActiveError,
  CombatantNotFoundError,
  TurnAlreadyChangedError,
} from './combat.error';

/** A token of an entry and who controls it. */
export type CombatantToken = Readonly<{ tokenId: string; controllerIds: readonly string[] }>;

export type CombatantState = Readonly<{
  id: string;
  tokens: readonly CombatantToken[];
  initiative: number | null;
  tieOrder: number;
}>;

export type CombatState = Readonly<{
  id: string;
  round: number;
  currentCombatantId: string | null;
  combatants: readonly CombatantState[];
}>;

export type TieOrderChange = Readonly<{ combatantId: string; tieOrder: number }>;

/** The turn decisions (spec §3.5, §3.9): the master runs the combat; whoever controls every token
 *  of an entry sets its initiative and passes its turn. Who is in it is the `CombatRosterBo`'s; the
 *  order and the turns are the game-core's.
 *
 *  Example: `new CombatBo(access, state).nextTurn(command.fromCombatantId)` */
export class CombatBo {
  constructor(
    private readonly access: CampaignAccessBo,
    private readonly combat: CombatState | null,
  ) {}

  end(): CombatState {
    this.access.requireMaster('end the combat');
    return this.active();
  }

  moveInTie(combatantId: string, direction: TieDirection): TieOrderChange[] {
    this.access.requireMaster('reorder a tie');
    const combat = this.active();
    this.combatant(combatantId);
    const moved = moveWithinTie(combat.combatants, combatantId, direction);
    return moved
      .filter((entry, index) => entry.tieOrder !== combat.combatants[index]?.tieOrder)
      .map(({ id, tieOrder }) => ({ combatantId: id, tieOrder }));
  }

  setInitiative(combatantId: string, value: number | null): number | null {
    this.requireEntryControl(this.combatant(combatantId), 'set the initiative of');
    return initiative(value);
  }

  nextTurn(fromCombatantId: string): AdvancedTurn {
    const combat = this.turnFrom(fromCombatantId);
    const current = combat.combatants.find(({ id }) => id === combat.currentCombatantId);
    if (current) this.requireEntryControl(current, 'pass the turn of');
    else this.access.requireMaster('start the turns');
    return advanceTurn(this.order(), turnOf(combat));
  }

  previousTurn(fromCombatantId: string): TurnState {
    this.access.requireMaster('go back a turn');
    return retreatTurn(this.order(), turnOf(this.turnFrom(fromCombatantId)));
  }

  /** Ids in turn order (highest initiative first, ties by order of entry). */
  order(): string[] {
    return orderCombatants(this.combat?.combatants ?? []).map(({ id }) => id);
  }

  private turnFrom(fromCombatantId: string): CombatState {
    const combat = this.active();
    if (combat.currentCombatantId !== fromCombatantId) {
      throw new TurnAlreadyChangedError(fromCombatantId, combat.currentCombatantId);
    }
    return combat;
  }

  private active(): CombatState {
    if (!this.combat) throw new CombatNotActiveError(this.access.campaignIdOf());
    return this.combat;
  }

  private combatant(combatantId: string): CombatantState {
    return entryIn(this.active(), combatantId);
  }

  // The master runs any entry; a player only one whose every token they control, and never one
  // without tokens. The first token they do not control is the one the refusal cites.
  private requireEntryControl(entry: CombatantState, action: string): void {
    if (entry.tokens.length === 0) this.access.requireMaster(`${action} entry ${entry.id}`);
    for (const token of entry.tokens) new TokenAccessBo(this.access, token).requireControl(action);
  }
}

/** The entry `combatantId` of the combat; one of another combat is COMBATANT_NOT_FOUND.
 *
 *  Example: `entryIn(combat, command.combatantId)` */
export function entryIn(combat: CombatState, combatantId: string): CombatantState {
  const found = combat.combatants.find(({ id }) => id === combatantId);
  if (!found) throw new CombatantNotFoundError(combat.id, combatantId);
  return found;
}

/** The game-core turn speaks of `currentId`; the combat row of `currentCombatantId`.
 *
 *  Example: `advanceTurn(order, turnOf(combat))` */
export function turnOf(combat: CombatState): TurnState {
  return { round: combat.round, currentId: combat.currentCombatantId };
}
