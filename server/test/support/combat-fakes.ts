import type { CombatDao, CombatRow, TieOrderChange } from '../../src/modules/combat/combat.dao';
import type { CombatantPo } from '../../src/modules/combat/combat.po';
import type { CombatTransactionRunner } from '../../src/modules/combat/combat.service';
import type { ConditionsDaoFake } from './conditions-fakes';
import type { ScenesDaoFake } from './scenes-fakes';
import type { TokensDaoFake } from './tokens-fakes';

const STARTED = new Date('2026-10-15T12:00:00Z');

/** In-memory combats by scene; writes go to the shared `journal` ('save').
 *
 *  Example: `const combat = new CombatDaoFake(scenes.journal); await combat.start(sceneId, ids)` */
export class CombatDaoFake implements Pick<
  CombatDao,
  | 'start'
  | 'findOfScene'
  | 'addCombatants'
  | 'removeCombatant'
  | 'setInitiative'
  | 'setTieOrders'
  | 'setTurn'
  | 'end'
> {
  readonly rows = new Map<string, CombatRow>();

  constructor(private readonly journal: string[] = []) {}

  async start(sceneId: string, tokenIds: readonly string[]): Promise<CombatRow> {
    this.journal.push('save');
    const combat = {
      id: `combat-${sceneId}`,
      sceneId,
      round: 1,
      currentCombatantId: null,
      startedAt: STARTED,
    };
    const row: CombatRow = {
      combat,
      combatants: tokenIds.map((tokenId, index) => this.combatantOf(combat.id, tokenId, index)),
    };
    this.rows.set(sceneId, row);
    return row;
  }

  async findOfScene(sceneId: string): Promise<CombatRow | undefined> {
    return this.rows.get(sceneId);
  }

  async addCombatants(combatId: string, tokenIds: readonly string[]): Promise<void> {
    this.change(combatId, (row) => {
      const next = row.combatants.length;
      const fresh = tokenIds.map((tokenId, index) =>
        this.combatantOf(combatId, tokenId, next + index),
      );
      return { ...row, combatants: [...row.combatants, ...fresh] };
    });
  }

  async removeCombatant(combatId: string, combatantId: string): Promise<void> {
    this.change(combatId, (row) => ({
      ...row,
      combatants: row.combatants.filter(({ id }) => id !== combatantId),
    }));
  }

  async setInitiative(combatantId: string, initiative: number | null): Promise<void> {
    this.changeCombatant(combatantId, { initiative });
  }

  async setTieOrders(changes: readonly TieOrderChange[]): Promise<void> {
    for (const { combatantId, tieOrder } of changes)
      this.changeCombatant(combatantId, { tieOrder });
  }

  async setTurn(combatId: string, round: number, currentCombatantId: string | null): Promise<void> {
    this.change(combatId, (row) => ({
      ...row,
      combat: { ...row.combat, round, currentCombatantId },
    }));
  }

  async end(combatId: string): Promise<void> {
    this.journal.push('save');
    for (const [sceneId, row] of this.rows)
      if (row.combat.id === combatId) this.rows.delete(sceneId);
  }

  /** What deleting a token does to its combatant (the cascade of the real table). */
  dropToken(tokenId: string): void {
    for (const [sceneId, row] of this.rows) {
      this.rows.set(sceneId, {
        ...row,
        combatants: row.combatants.filter((c) => c.tokenId !== tokenId),
      });
    }
  }

  private combatantOf(combatId: string, tokenId: string, tieOrder: number): CombatantPo {
    return { id: `c-${tokenId}`, combatId, tokenId, initiative: null, tieOrder };
  }

  private change(combatId: string, update: (row: CombatRow) => CombatRow): void {
    this.journal.push('save');
    for (const [sceneId, row] of this.rows)
      if (row.combat.id === combatId) this.rows.set(sceneId, update(row));
  }

  private changeCombatant(combatantId: string, fields: Partial<CombatantPo>): void {
    this.journal.push('save');
    for (const [sceneId, row] of this.rows) {
      const combatants = row.combatants.map((c) =>
        c.id === combatantId ? { ...c, ...fields } : c,
      );
      this.rows.set(sceneId, { ...row, combatants });
    }
  }
}

/** Runs the work on the fakes and writes 'commit' to the shared journal once it resolves. */
export class CombatTransactionRunnerFake {
  constructor(
    private readonly daos: Readonly<{
      scenes: ScenesDaoFake;
      tokens: TokensDaoFake;
      combat: CombatDaoFake;
      conditions: ConditionsDaoFake;
    }>,
  ) {}

  readonly run: CombatTransactionRunner = async (work) => {
    const result = await work(this.daos);
    this.daos.scenes.journal.push('commit');
    return result;
  };
}
