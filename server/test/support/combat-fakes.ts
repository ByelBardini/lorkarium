import type {
  CombatDao,
  CombatantRow,
  CombatRow,
  NewCombatant,
  TieOrderChange,
} from '../../src/modules/combat/combat.dao';
import type { CombatTransactionRunner } from '../../src/modules/combat/combat.service';
import type { ConditionsDaoFake } from './conditions-fakes';
import type { ScenesDaoFake } from './scenes-fakes';
import type { TokensDaoFake } from './tokens-fakes';

const STARTED = new Date('2026-10-15T12:00:00Z');

/** One unnamed entry per token, as the tracker had before groups.
 *
 *  Example: `await combat.start(VHARN_SCENE_ID, soloEntries(LYRA_ID, BRAM_ID))` */
export function soloEntries(...tokenIds: string[]): NewCombatant[] {
  return tokenIds.map((tokenId) => ({ name: null, tokenIds: [tokenId], initiative: null }));
}

/** In-memory combats by scene; writes go to the shared `journal` ('save'). An entry is
 *  `c-<first token>`, or `c-<name>` without tokens.
 *
 *  Example: `const combat = new CombatDaoFake(scenes.journal); await combat.start(sceneId, entries)` */
export class CombatDaoFake implements Pick<
  CombatDao,
  | 'start'
  | 'findOfScene'
  | 'addCombatants'
  | 'linkTokens'
  | 'unlinkTokens'
  | 'removeCombatants'
  | 'rename'
  | 'setInitiative'
  | 'setTieOrders'
  | 'setTurn'
  | 'end'
> {
  readonly rows = new Map<string, CombatRow>();

  constructor(private readonly journal: string[] = []) {}

  async start(sceneId: string, entries: readonly NewCombatant[]): Promise<CombatRow> {
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
      combatants: entries.map((entry, index) => this.combatantOf(combat.id, entry, index)),
    };
    this.rows.set(sceneId, row);
    return row;
  }

  async findOfScene(sceneId: string): Promise<CombatRow | undefined> {
    return this.rows.get(sceneId);
  }

  async addCombatants(combatId: string, entries: readonly NewCombatant[]): Promise<string[]> {
    const fresh: CombatantRow[] = [];
    this.change(combatId, (row) => {
      const next = Math.max(-1, ...row.combatants.map(({ tieOrder }) => tieOrder)) + 1;
      fresh.push(...entries.map((entry, index) => this.combatantOf(combatId, entry, next + index)));
      return { ...row, combatants: [...row.combatants, ...fresh] };
    });
    return fresh.map(({ id }) => id);
  }

  async linkTokens(combatantId: string, tokenIds: readonly string[]): Promise<void> {
    this.changeEveryCombatant((c) => {
      const others = c.tokenIds.filter((tokenId) => !tokenIds.includes(tokenId));
      return { ...c, tokenIds: c.id === combatantId ? [...others, ...tokenIds] : others };
    });
  }

  async unlinkTokens(tokenIds: readonly string[]): Promise<void> {
    this.changeEveryCombatant((c) => ({
      ...c,
      tokenIds: c.tokenIds.filter((tokenId) => !tokenIds.includes(tokenId)),
    }));
  }

  async removeCombatants(combatId: string, combatantIds: readonly string[]): Promise<void> {
    this.change(combatId, (row) => ({
      ...row,
      combatants: row.combatants.filter(({ id }) => !combatantIds.includes(id)),
    }));
  }

  async rename(combatantId: string, name: string): Promise<void> {
    this.changeEveryCombatant((c) => (c.id === combatantId ? { ...c, name } : c));
  }

  async setInitiative(combatantId: string, initiative: number | null): Promise<void> {
    this.changeEveryCombatant((c) => (c.id === combatantId ? { ...c, initiative } : c));
  }

  async setTieOrders(changes: readonly TieOrderChange[]): Promise<void> {
    this.changeEveryCombatant((c) => {
      const change = changes.find(({ combatantId }) => combatantId === c.id);
      return change ? { ...c, tieOrder: change.tieOrder } : c;
    });
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

  /** What deleting a token does to its link (the cascade of the real table): the entry stays. */
  dropToken(tokenId: string): void {
    for (const [sceneId, row] of this.rows) {
      const combatants = row.combatants.map((c) => ({
        ...c,
        tokenIds: c.tokenIds.filter((id) => id !== tokenId),
      }));
      this.rows.set(sceneId, { ...row, combatants });
    }
  }

  private combatantOf(combatId: string, entry: NewCombatant, tieOrder: number): CombatantRow {
    const { name, tokenIds, initiative } = entry;
    const id = `c-${tokenIds[0] ?? name}`;
    return { id, combatId, name, tokenIds: [...tokenIds], initiative, tieOrder };
  }

  private change(combatId: string, update: (row: CombatRow) => CombatRow): void {
    this.journal.push('save');
    for (const [sceneId, row] of this.rows)
      if (row.combat.id === combatId) this.rows.set(sceneId, update(row));
  }

  private changeEveryCombatant(update: (combatant: CombatantRow) => CombatantRow): void {
    this.journal.push('save');
    for (const [sceneId, row] of this.rows) {
      this.rows.set(sceneId, { ...row, combatants: row.combatants.map(update) });
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
