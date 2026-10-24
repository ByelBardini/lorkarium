import type {
  ConditionUsageCommandDto,
  DeleteConditionDefinitionCommandDto,
  UpdateConditionDefinitionCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { inLockedCast } from '../scenes/locked-cast';
import { gridEventBase, type GridEventBase, type SavedInScene } from '../scenes/locked-scene';
import { ConditionRulesBo } from './condition-rules.bo';
import type { ConditionsDao } from './conditions.dao';
import { ConditionNotFoundError } from './conditions.error';
import { toConditionDefinitionDto, toNewConditionDefinition } from './conditions.mapper';
import type { ConditionDefinitionPo } from './conditions.po';
import type { ConditionTransactionRunner, ConditionWriteDaos } from './conditions.service';

type Envelope = 'actionId' | 'campaignId';
export type UpdateConditionDefinition = Omit<UpdateConditionDefinitionCommandDto, Envelope>;
export type DeleteConditionDefinition = Omit<DeleteConditionDefinitionCommandDto, Envelope>;
export type ConditionUsage = Omit<ConditionUsageCommandDto, Envelope>;

export type ConditionCatalogServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: ConditionTransactionRunner;
  /** Out of any transaction: the usage count is a read that locks nothing. */
  reader: Pick<ConditionsDao, 'findDefinitionInCampaign' | 'countActiveOf'>;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

const RULES = new ConditionRulesBo();

/** The table's list of conditions, the master's alone: edit, delete (it leaves every token),
 *  count where it is held and bring back the missing defaults. The list is the table's, so the
 *  writes lock and bump the CAST whatever grid the command names, and publish to its rooms
 *  (every member) after the commit.
 *
 *  Example: `await catalog.update(user.id, campaignId, { conditionId, name: 'Envenenado', tone: 'harm', icon: 'flask-conical', look: null, color: null, description: '', maxStacks: null })` */
export class ConditionCatalogService {
  constructor(private readonly deps: ConditionCatalogServiceDeps) {}

  /** Renaming into another condition's name (any case) refuses with CONDITION_NAME_TAKEN.
   *  Lowering or taking away `maxStacks` clamps the tokens holding it in the same transaction. */
  async update(
    userId: string,
    campaignId: string,
    command: UpdateConditionDefinition,
  ): Promise<number> {
    await this.requireMaster(userId, campaignId, 'edit a condition');
    const { conditionId } = command;
    const saved = await inLockedCast(this.deps.transaction, campaignId, async ({ daos }) => {
      await knownDefinition(daos, campaignId, conditionId);
      const sameName = await daos.conditions.findDefinitionByName(campaignId, command.name);
      RULES.requireNameFree(conditionId, sameName);
      const fields = toNewConditionDefinition(command);
      const row = await daos.conditions.updateDefinition(campaignId, conditionId, fields);
      if (!row) throw new ConditionNotFoundError(campaignId, conditionId);
      await daos.conditions.capStacks(conditionId, RULES.stacksCeilingOf(row.maxStacks));
      return { value: row, changed: true };
    });
    const definition = toConditionDefinitionDto(saved.value);
    this.deps.publisher.conditionDefinitionUpdated({
      ...this.baseOf(campaignId, saved),
      definition,
    });
    return saved.version;
  }

  /** The active conditions pointing at it go with it (the cascade), on every grid and the cast. */
  async delete(
    userId: string,
    campaignId: string,
    command: DeleteConditionDefinition,
  ): Promise<number> {
    await this.requireMaster(userId, campaignId, 'delete a condition');
    const { conditionId } = command;
    const saved = await inLockedCast(this.deps.transaction, campaignId, async ({ daos }) => {
      const deleted = await daos.conditions.deleteDefinition(campaignId, conditionId);
      if (!deleted) throw new ConditionNotFoundError(campaignId, conditionId);
      return { value: conditionId, changed: true };
    });
    this.deps.publisher.conditionDefinitionDeleted({
      ...this.baseOf(campaignId, saved),
      conditionId,
    });
    return saved.version;
  }

  /** How many tokens hold it, on every grid and the cast: no lock, no version.
   *
   *  Example: `const tokens = await catalog.usage(user.id, campaignId, { conditionId }) // 3` */
  async usage(userId: string, campaignId: string, command: ConditionUsage): Promise<number> {
    await this.requireMaster(userId, campaignId, 'count the tokens holding a condition');
    const { reader } = this.deps;
    const known = await reader.findDefinitionInCampaign(campaignId, command.conditionId);
    if (!known) throw new ConditionNotFoundError(campaignId, command.conditionId);
    return reader.countActiveOf(campaignId, known.id);
  }

  /** Nothing missing: the current version, with no bump and no event. */
  async restoreDefaults(userId: string, campaignId: string): Promise<number> {
    await this.requireMaster(userId, campaignId, 'restore the default conditions');
    const saved = await inLockedCast(this.deps.transaction, campaignId, async ({ daos }) => {
      const existing = await daos.conditions.listDefinitions(campaignId);
      const missing = RULES.missingDefaults(existing.map((definition) => definition.name));
      const restored = await daos.conditions.insertDefinitions(campaignId, missing);
      return { value: restored, changed: restored.length > 0 };
    });
    if (saved.value.length === 0) return saved.version;
    const definitions = saved.value.map(toConditionDefinitionDto);
    this.deps.publisher.conditionDefaultsRestored({
      ...this.baseOf(campaignId, saved),
      definitions,
    });
    return saved.version;
  }

  private async requireMaster(userId: string, campaignId: string, action: string): Promise<void> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    access.requireMember();
    access.requireMaster(action);
  }

  private baseOf(campaignId: string, saved: SavedInScene<unknown>): GridEventBase {
    return gridEventBase(campaignId, saved, this.deps.clock);
  }
}

async function knownDefinition(
  daos: ConditionWriteDaos,
  campaignId: string,
  conditionId: string,
): Promise<ConditionDefinitionPo> {
  const known = await daos.conditions.findDefinitionInCampaign(campaignId, conditionId);
  if (!known) throw new ConditionNotFoundError(campaignId, conditionId);
  return known;
}
