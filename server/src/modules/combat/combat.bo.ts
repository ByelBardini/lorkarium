import {
  advanceTurn,
  initiative,
  moveWithinTie,
  nextAfterRemoval,
  orderCombatants,
  retreatTurn,
  type AdvancedTurn,
  type TieDirection,
  type TurnState,
} from '@lorkarium/game-core';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { TokenAccessBo } from '../tokens/token-access.bo';
import { TokenNotFoundError } from '../tokens/tokens.error';
import {
  CombatAlreadyActiveError,
  CombatNotActiveError,
  CombatantNotFoundError,
  TurnAlreadyChangedError,
} from './combat.error';

export type CombatantState = Readonly<{
  id: string;
  tokenId: string;
  initiative: number | null;
  tieOrder: number;
  controllerIds: readonly string[];
}>;

export type CombatState = Readonly<{
  id: string;
  round: number;
  currentCombatantId: string | null;
  combatants: readonly CombatantState[];
}>;

export type TieOrderChange = Readonly<{ combatantId: string; tieOrder: number }>;

/** The combat decisions (spec §3.5, §3.9): the master runs it; a token's controller sets its
 *  initiative and passes the turn when it is theirs. The order and the turns are the game-core's.
 *
 *  Example: `new CombatBo(access, state).nextTurn(command.fromCombatantId)` */
export class CombatBo {
  constructor(
    private readonly access: CampaignAccessBo,
    private readonly combat: CombatState | null,
  ) {}

  start(tokenIds: readonly string[], sceneTokenIds: readonly string[]): string[] {
    this.access.requireMaster('start the combat');
    if (this.combat) throw new CombatAlreadyActiveError(this.combat.id);
    return this.knownTokens(tokenIds, sceneTokenIds);
  }

  end(): CombatState {
    this.access.requireMaster('end the combat');
    return this.active();
  }

  addCombatants(tokenIds: readonly string[], sceneTokenIds: readonly string[]): string[] {
    this.access.requireMaster('add combatants');
    const combat = this.active();
    const fresh = this.knownTokens(tokenIds, sceneTokenIds);
    return fresh.filter((tokenId) => !combat.combatants.some((c) => c.tokenId === tokenId));
  }

  removeCombatant(combatantId: string): TurnState {
    this.access.requireMaster('take a combatant out');
    const combat = this.active();
    this.combatant(combatantId);
    return nextAfterRemoval(this.order(), combatantId, turnOf(combat));
  }

  /** The turn once `tokenId` (being deleted) leaves the combat, or `null` when it was not in it. */
  turnWithoutToken(tokenId: string): TurnState | null {
    const leaving = this.combat?.combatants.find((c) => c.tokenId === tokenId);
    if (!this.combat || !leaving) return null;
    return nextAfterRemoval(this.order(), leaving.id, turnOf(this.combat));
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
    const combatant = this.combatant(combatantId);
    this.tokenAccess(combatant).requireControl('set the initiative of');
    return initiative(value);
  }

  nextTurn(fromCombatantId: string): AdvancedTurn {
    const combat = this.turnFrom(fromCombatantId);
    const current = combat.combatants.find(({ id }) => id === combat.currentCombatantId);
    if (current) this.tokenAccess(current).requireControl('pass the turn of');
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
    const combat = this.active();
    const found = combat.combatants.find(({ id }) => id === combatantId);
    if (!found) throw new CombatantNotFoundError(combat.id, combatantId);
    return found;
  }

  private tokenAccess(combatant: CombatantState): TokenAccessBo {
    const control = { tokenId: combatant.tokenId, controllerIds: combatant.controllerIds };
    return new TokenAccessBo(this.access, control);
  }

  private knownTokens(tokenIds: readonly string[], sceneTokenIds: readonly string[]): string[] {
    const stranger = tokenIds.find((id) => !sceneTokenIds.includes(id));
    if (stranger) throw new TokenNotFoundError(this.access.campaignIdOf(), stranger);
    return [...new Set(tokenIds)];
  }
}

// The game-core turn speaks of `currentId`; the combat row of `currentCombatantId`.
function turnOf(combat: CombatState): TurnState {
  return { round: combat.round, currentId: combat.currentCombatantId };
}
