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
  | 'insertDefinitions'
  | 'updateDefinition'
  | 'deleteDefinition'
  | 'countActiveOf'
  | 'findDefinitionInCampaign'
  | 'apply'
  | 'remove'
  | 'setRounds'
  | 'stacksOf'
  | 'findActiveOnToken'
  | 'setStacks'
  | 'capStacks'
  | 'listDefinitions'
  | 'listOfTokens'
  | 'decrementRemaining'
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
    look: ConditionDefinitionPo['look'] = null,
    description = '',
    maxStacks: ConditionDefinitionPo['maxStacks'] = null,
    color: ConditionDefinitionPo['color'] = null,
  ): string {
    const id = `${campaignId}-${name}`;
    this.definitions.push({
      id,
      campaignId,
      name,
      tone,
      icon,
      look,
      color,
      description,
      maxStacks,
      createdAt: CREATED,
    });
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
    const { name, tone, icon, look, color, description, maxStacks } = input;
    const id = this.define(campaignId, name, tone, icon, look, description, maxStacks, color);
    return this.definitions.find((d) => d.id === id) as ConditionDefinitionPo;
  }

  async insertDefinitions(
    campaignId: string,
    list: readonly NewConditionDefinition[],
  ): Promise<ConditionDefinitionPo[]> {
    if (list.length === 0) return [];
    this.journal.push('save');
    return list.map((input) => {
      const { name, tone, icon, look, color, description, maxStacks } = input;
      const id = this.define(campaignId, name, tone, icon, look, description, maxStacks, color);
      return this.definitions.find((d) => d.id === id) as ConditionDefinitionPo;
    });
  }

  /** Like the DAO: the active conditions read the new fields; another table's id finds nothing. */
  async updateDefinition(
    campaignId: string,
    conditionId: string,
    fields: NewConditionDefinition,
  ): Promise<ConditionDefinitionPo | undefined> {
    this.journal.push('save');
    const index = this.definitions.findIndex(
      (d) => d.campaignId === campaignId && d.id === conditionId,
    );
    const found = this.definitions[index];
    if (!found) return undefined;
    const row = { ...found, ...fields };
    this.definitions[index] = row;
    const { name, tone, icon, look, color, description, maxStacks } = fields;
    this.active = this.active.map((a) =>
      a.conditionId === conditionId
        ? { ...a, name, tone, icon, look, color, description, maxStacks }
        : a,
    );
    return row;
  }

  /** Like the cascade: the active conditions pointing at it go too. */
  async deleteDefinition(campaignId: string, conditionId: string): Promise<boolean> {
    this.journal.push('save');
    const index = this.definitions.findIndex(
      (d) => d.campaignId === campaignId && d.id === conditionId,
    );
    if (index < 0) return false;
    this.definitions.splice(index, 1);
    this.active = this.active.filter((a) => a.conditionId !== conditionId);
    return true;
  }

  /** The tokens holding it; the fake keeps no scene, so only the definition's table is checked. */
  async countActiveOf(campaignId: string, conditionId: string): Promise<number> {
    const known = await this.findDefinitionInCampaign(campaignId, conditionId);
    if (!known) return 0;
    const holders = this.active.filter((a) => a.conditionId === conditionId);
    return new Set(holders.map((a) => a.tokenId)).size;
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
    stacks = 1,
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
      look: definition.look,
      color: definition.color,
      description: definition.description,
      maxStacks: definition.maxStacks,
      stacks,
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

  async setRounds(
    tokenId: string,
    activeConditionId: string,
    remainingRounds: number | null,
  ): Promise<ActiveConditionRow | undefined> {
    this.journal.push('save');
    const found = this.active.find((a) => a.tokenId === tokenId && a.id === activeConditionId);
    if (!found) return undefined;
    const row = { ...found, remainingRounds };
    this.active = this.active.map((a) => (a === found ? row : a));
    return row;
  }

  async stacksOf(
    tokenIds: readonly string[],
    conditionId: string,
  ): Promise<ReadonlyMap<string, number>> {
    const held = this.active.filter(
      (a) => a.conditionId === conditionId && tokenIds.includes(a.tokenId),
    );
    return new Map(held.map((a) => [a.tokenId, a.stacks]));
  }

  async findActiveOnToken(
    tokenId: string,
    activeConditionId: string,
  ): Promise<ActiveConditionRow | undefined> {
    return this.active.find((a) => a.tokenId === tokenId && a.id === activeConditionId);
  }

  async setStacks(
    tokenId: string,
    activeConditionId: string,
    stacks: number,
  ): Promise<ActiveConditionRow | undefined> {
    this.journal.push('save');
    const found = await this.findActiveOnToken(tokenId, activeConditionId);
    if (!found) return undefined;
    const row = { ...found, stacks };
    this.active = this.active.map((a) => (a === found ? row : a));
    return row;
  }

  /** No journal entry: the catalog's journal counts the definition's update as its one save. */
  async capStacks(conditionId: string, ceiling: number): Promise<void> {
    this.active = this.active.map((a) =>
      a.conditionId === conditionId && a.stacks > ceiling ? { ...a, stacks: ceiling } : a,
    );
  }

  async listOfTokens(tokenIds: readonly string[]): Promise<ActiveConditionRow[]> {
    return this.active.filter((a) => tokenIds.includes(a.tokenId));
  }

  async decrementRemaining(activeConditionIds: readonly string[]): Promise<void> {
    if (activeConditionIds.length === 0) return;
    this.journal.push('save');
    this.active = this.active.map((a) =>
      activeConditionIds.includes(a.id) && a.remainingRounds !== null
        ? { ...a, remainingRounds: a.remainingRounds - 1 }
        : a,
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
