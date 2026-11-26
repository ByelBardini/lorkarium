import type {
  CombatCyclePhase,
  CombatCycleState,
  RoundCycleRow,
  RoundCycleWrite,
} from '../../src/modules/round-cycles/round-cycles.dao';
import type { RoundCycleWriteDaos } from '../../src/modules/round-cycles/round-cycles.service';
import type {
  RoundCyclePublisherPort,
  RoundCyclesChange,
} from '../../src/modules/round-cycles/round-cycle-publisher.port';
import type { RoundCyclesAnnouncedDto } from '@lorkarium/contracts';
import { AssetsDaoFake } from './assets-fakes';
import type { CharactersDaoFake } from './characters-fakes';
import { roundCycleRow } from './round-cycles-factories';

type FakeCycleMethods = keyof RoundCycleWriteDaos['roundCycles'];

/** The round cycles in memory, writing what it does to the shared journal. `players` and
 *  `looseTokens` are who may be a member and which tokens may hold a cycle, per table. */
export class RoundCyclesDaoFake implements Pick<
  RoundCycleWriteDaos['roundCycles'],
  FakeCycleMethods
> {
  readonly rows: RoundCycleRow[] = [];
  readonly states: CombatCycleState[] = [];
  readonly players: Record<string, readonly string[]> = {};
  readonly looseTokens: Record<string, readonly string[]> = {};
  private next = 0;

  constructor(readonly journal: string[] = []) {}

  async insertCycle(campaignId: string, write: RoundCycleWrite): Promise<RoundCycleRow> {
    this.journal.push(`insert cycle ${write.name}`);
    const row = this.rowOf(campaignId, `cycle-${++this.next}`, write);
    this.rows.push(row);
    return row;
  }

  async replaceCycle(
    campaignId: string,
    cycleId: string,
    write: RoundCycleWrite,
  ): Promise<RoundCycleRow | undefined> {
    const index = this.rows.findIndex(
      ({ cycle }) => cycle.id === cycleId && cycle.campaignId === campaignId,
    );
    if (index === -1) return undefined;
    this.journal.push(`replace cycle ${write.name}`);
    const row = this.rowOf(campaignId, cycleId, write);
    this.rows[index] = row;
    return row;
  }

  async deleteCycle(campaignId: string, cycleId: string): Promise<boolean> {
    const before = this.rows.length;
    const kept = this.rows.filter(
      ({ cycle }) => !(cycle.id === cycleId && cycle.campaignId === campaignId),
    );
    this.rows.splice(0, this.rows.length, ...kept);
    if (kept.length === before) return false;
    this.journal.push(`delete cycle ${cycleId}`);
    return true;
  }

  async findInCampaign(campaignId: string, cycleId: string): Promise<RoundCycleRow | undefined> {
    return this.rows.find(({ cycle }) => cycle.id === cycleId && cycle.campaignId === campaignId);
  }

  async listOfCampaign(campaignId: string): Promise<RoundCycleRow[]> {
    return this.rows.filter(({ cycle }) => cycle.campaignId === campaignId);
  }

  async countOfCampaign(campaignId: string): Promise<number> {
    return (await this.listOfCampaign(campaignId)).length;
  }

  async combatStatesOfCampaign(campaignId: string): Promise<CombatCycleState[]> {
    const ids = new Set((await this.listOfCampaign(campaignId)).map(({ cycle }) => cycle.id));
    return this.states.filter(({ cycleId }) => ids.has(cycleId));
  }

  async playerIdsOf(campaignId: string): Promise<string[]> {
    return [...(this.players[campaignId] ?? [])];
  }

  async looseTokenInCampaign(campaignId: string, tokenId: string): Promise<boolean> {
    return (this.looseTokens[campaignId] ?? []).includes(tokenId);
  }

  async setChosen(combatId: string, cycleId: string, phaseId: string | null): Promise<boolean> {
    const index = this.states.findIndex(
      (one) => one.combatId === combatId && one.cycleId === cycleId,
    );
    const state = this.states[index];
    if (!state) return false;
    this.journal.push(`choose ${phaseId ?? 'follow'}`);
    this.states[index] = { ...state, chosenPhaseId: phaseId };
    return true;
  }

  async startCycles(combatId: string, entries: readonly CombatCyclePhase[]): Promise<void> {
    if (entries.length === 0) return;
    this.journal.push(`start cycles ${entries.map(({ cycleId }) => cycleId).join(',')}`);
    for (const entry of entries) {
      this.states.push({
        combatId,
        sceneId: this.sceneOf(combatId),
        round: 1,
        ...entry,
        chosenPhaseId: null,
      });
    }
  }

  async removeCycles(combatId: string, cycleIds: readonly string[]): Promise<void> {
    if (cycleIds.length === 0) return;
    this.journal.push(`remove cycles ${cycleIds.join(',')}`);
    const kept = this.states.filter(
      (one) => !(one.combatId === combatId && cycleIds.includes(one.cycleId)),
    );
    this.states.splice(0, this.states.length, ...kept);
  }

  async turnAll(combatId: string, changes: readonly CombatCyclePhase[]): Promise<void> {
    if (changes.length === 0) return;
    this.journal.push(
      `turn cycles ${changes.map(({ currentPhaseId }) => currentPhaseId).join(',')}`,
    );
    for (const change of changes) {
      const index = this.states.findIndex(
        (one) => one.combatId === combatId && one.cycleId === change.cycleId,
      );
      const state = this.states[index];
      if (state)
        this.states[index] = {
          ...state,
          currentPhaseId: change.currentPhaseId,
          chosenPhaseId: null,
        };
    }
  }

  /** The grid each combat of the fake is on (`scene-1` unless set). */
  readonly combatScenes: Record<string, string> = {};

  private sceneOf(combatId: string): string {
    return this.combatScenes[combatId] ?? 'scene-1';
  }

  private rowOf(campaignId: string, id: string, write: RoundCycleWrite): RoundCycleRow {
    const { phases, members, ...fields } = write;
    const row = roundCycleRow({
      id,
      campaignId,
      ...fields,
      members,
      phaseNames: phases.map(({ name }) => name),
    });
    return {
      ...row,
      phases: row.phases.map((phase, i) => ({
        ...phase,
        imageAssetId: phases[i]?.imageAssetId ?? null,
      })),
    };
  }
}

/** Records every change and announcement published, and writes `publish` to the journal. */
export class RoundCyclePublisherFake implements RoundCyclePublisherPort {
  readonly changes: RoundCyclesChange[] = [];
  readonly announced: RoundCyclesAnnouncedDto[] = [];

  constructor(private readonly journal: string[] = []) {}

  roundCyclesChanged(change: RoundCyclesChange): void {
    this.journal.push('publish');
    this.changes.push(change);
  }

  roundCyclesAnnounced(event: RoundCyclesAnnouncedDto): void {
    this.journal.push('announce');
    this.announced.push(event);
  }
}

/** Runs the work on the fakes and writes `commit` to the shared journal once it resolves. */
export class RoundCycleTransactionRunnerFake {
  constructor(
    readonly characters: CharactersDaoFake,
    readonly roundCycles: RoundCyclesDaoFake,
    readonly assets: AssetsDaoFake = new AssetsDaoFake(),
  ) {}

  readonly run = async <T>(work: (daos: RoundCycleWriteDaos) => Promise<T>): Promise<T> => {
    const { characters, roundCycles, assets } = this;
    const result = await work({ characters, roundCycles, assets });
    this.characters.journal.push('commit');
    return result;
  };
}
