import type {
  ActiveConditionRow,
  ConditionDuration,
  ConditionsDao,
} from '../../src/modules/conditions/conditions.dao';
import type {
  ConditionDefinitionPo,
  NewConditionDefinition,
} from '../../src/modules/conditions/conditions.po';
import type { ConditionTransactionRunner } from '../../src/modules/conditions/conditions.service';
import { CombatDaoFake } from './combat-fakes';
import type { ScenesDaoFake } from './scenes-fakes';
import type { TokensDaoFake } from './tokens-fakes';

const CREATED = new Date('2026-10-15T12:00:00Z');

/** In-memory condition definitions and active conditions; writes go to the shared `journal`.
 *
 *  Example: `const conditions = new ConditionsDaoFake(scenes.journal); conditions.define(VHARN_ID, 'Envenenado', 'harm')` */
export class ConditionsDaoFake implements Pick<
  ConditionsDao,
  | 'findDefinitionByName'
  | 'insertDefinition'
  | 'findDefinitionInCampaign'
  | 'apply'
  | 'remove'
  | 'listDefinitions'
  | 'listOfTokens'
  | 'setRemaining'
  | 'deleteActive'
> {
  readonly definitions: ConditionDefinitionPo[] = [];
  active: ActiveConditionRow[] = [];

  constructor(private readonly journal: string[] = []) {}

  /** Seeds a definition without touching the journal. */
  define(
    campaignId: string,
    name: string,
    tone: ConditionDefinitionPo['tone'],
    icon: ConditionDefinitionPo['icon'] = 'circle-dot',
  ): string {
    const id = `${campaignId}-${name}`;
    this.definitions.push({ id, campaignId, name, tone, icon, createdAt: CREATED });
    return id;
  }

  async findDefinitionByName(
    campaignId: string,
    name: string,
  ): Promise<ConditionDefinitionPo | undefined> {
    const wanted = name.toLowerCase();
    return this.definitions.find(
      (d) => d.campaignId === campaignId && d.name.toLowerCase() === wanted,
    );
  }

  async insertDefinition(
    campaignId: string,
    input: NewConditionDefinition,
  ): Promise<ConditionDefinitionPo> {
    this.journal.push('save');
    const id = this.define(campaignId, input.name, input.tone, input.icon);
    return this.definitions.find((d) => d.id === id) as ConditionDefinitionPo;
  }

  async findDefinitionInCampaign(
    campaignId: string,
    conditionId: string,
  ): Promise<ConditionDefinitionPo | undefined> {
    return this.definitions.find((d) => d.campaignId === campaignId && d.id === conditionId);
  }

  async listDefinitions(campaignId: string): Promise<ConditionDefinitionPo[]> {
    return this.definitions.filter((d) => d.campaignId === campaignId);
  }

  async apply(
    tokenId: string,
    conditionId: string,
    duration: ConditionDuration,
  ): Promise<ActiveConditionRow> {
    this.journal.push('save');
    const definition = this.definitions.find((d) => d.id === conditionId);
    if (!definition) throw new Error(`ConditionsDaoFake has no definition ${conditionId}`);
    const kept = this.active.filter(
      (a) => !(a.tokenId === tokenId && a.conditionId === conditionId),
    );
    const row = {
      id: `${tokenId}-${conditionId}`,
      tokenId,
      conditionId,
      name: definition.name,
      tone: definition.tone,
      icon: definition.icon,
      ...duration,
    };
    this.active = [...kept, row];
    return row;
  }

  async remove(tokenId: string, activeConditionId: string): Promise<boolean> {
    this.journal.push('save');
    const before = this.active.length;
    this.active = this.active.filter((a) => !(a.tokenId === tokenId && a.id === activeConditionId));
    return this.active.length < before;
  }

  async listOfTokens(tokenIds: readonly string[]): Promise<ActiveConditionRow[]> {
    return this.active.filter((a) => tokenIds.includes(a.tokenId));
  }

  async setRemaining(activeConditionId: string, remainingRounds: number): Promise<void> {
    this.journal.push('save');
    this.active = this.active.map((a) =>
      a.id === activeConditionId ? { ...a, remainingRounds } : a,
    );
  }

  async deleteActive(activeConditionIds: readonly string[]): Promise<void> {
    this.journal.push('save');
    this.active = this.active.filter((a) => !activeConditionIds.includes(a.id));
  }
}

/** Runs the work on the fakes and writes 'commit' to the shared journal once it resolves. */
export class ConditionTransactionRunnerFake {
  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly tokens: TokensDaoFake,
    private readonly conditions: ConditionsDaoFake,
    /** The scene's combat, if any: its round stamps the conditions applied. */
    private readonly combat: CombatDaoFake = new CombatDaoFake(),
  ) {}

  readonly run: ConditionTransactionRunner = async (work) => {
    const result = await work({
      scenes: this.scenes,
      tokens: this.tokens,
      conditions: this.conditions,
      combat: this.combat,
    });
    this.scenes.journal.push('commit');
    return result;
  };
}
