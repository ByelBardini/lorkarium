import type {
  ApplyConditionCommandDto,
  DefineConditionCommandDto,
  RemoveConditionCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { toCampaignAccessBo } from '../campaigns/campaigns.mapper';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import type { ScenesDao } from '../scenes/scenes.dao';
import type { ScenePo } from '../scenes/scenes.po';
import { TokenAccessBo } from '../tokens/token-access.bo';
import type { TokenRow, TokensDao } from '../tokens/tokens.dao';
import { TokenNotFoundError } from '../tokens/tokens.error';
import { ConditionRulesBo } from './condition-rules.bo';
import type { ConditionsDao } from './conditions.dao';
import { ConditionNotFoundError } from './conditions.error';
import { toActiveConditionDto, toConditionDefinitionDto } from './conditions.mapper';

type Envelope = 'actionId' | 'campaignId';
export type DefineCondition = Omit<DefineConditionCommandDto, Envelope>;
export type ApplyCondition = Omit<ApplyConditionCommandDto, Envelope>;
export type RemoveCondition = Omit<RemoveConditionCommandDto, Envelope>;

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type ConditionWriteDaos = Readonly<{
  scenes: Pick<ScenesDao, 'lockActiveOf' | 'bumpVersion'>;
  tokens: Pick<TokensDao, 'findInScene'>;
  conditions: Pick<
    ConditionsDao,
    'findDefinitionByName' | 'insertDefinition' | 'findDefinitionInCampaign' | 'apply' | 'remove'
  >;
}>;

export type ConditionTransactionRunner = <T>(
  work: (daos: ConditionWriteDaos) => Promise<T>,
) => Promise<T>;

export type ConditionsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: ConditionTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

type Locked = Readonly<{ daos: ConditionWriteDaos; scene: ScenePo }>;
type Saved<T> = Readonly<{ value: T; version: number }>;
type EventBase = Readonly<{ campaignId: string; version: number; at: string }>;

const RULES = new ConditionRulesBo();

/** The conditions of a table: the master adds to the list; the master and a token's controllers
 *  apply and remove them. Persisted, version bumped, then published to the whole table.
 *
 *  Example: `await conditionsService.apply(user.id, campaignId, { tokenId, conditionId, rounds: 2 })` */
export class ConditionsService {
  constructor(private readonly deps: ConditionsServiceDeps) {}

  async define(userId: string, campaignId: string, command: DefineCondition): Promise<number> {
    (await this.accessOf(userId, campaignId)).requireMaster('define a condition');
    const outcome = await this.deps.transaction(async (daos) => {
      const scene = await lockedScene(daos, campaignId);
      const existing = await daos.conditions.findDefinitionByName(campaignId, command.name);
      if (RULES.defineOrReuse(existing).kind === 'reuse')
        return { version: scene.version, created: null };
      const created = await daos.conditions.insertDefinition(campaignId, command);
      return { version: await daos.scenes.bumpVersion(scene.id), created };
    });
    if (!outcome.created) return outcome.version;
    const definition = toConditionDefinitionDto(outcome.created);
    this.deps.publisher.conditionDefined({ ...this.base(campaignId, outcome.version), definition });
    return outcome.version;
  }

  async apply(userId: string, campaignId: string, command: ApplyCondition): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const token = await controlledToken(daos, scene, access, command.tokenId);
      const known = await daos.conditions.findDefinitionInCampaign(campaignId, command.conditionId);
      if (!known) throw new ConditionNotFoundError(campaignId, command.conditionId);
      return daos.conditions.apply(token.token.id, known.id, RULES.durationOf(command.rounds));
    });
    const condition = toActiveConditionDto(saved.value);
    const event = { ...this.base(campaignId, saved.version), tokenId: command.tokenId, condition };
    this.deps.publisher.conditionApplied(event);
    return saved.version;
  }

  async remove(userId: string, campaignId: string, command: RemoveCondition): Promise<number> {
    const access = await this.accessOf(userId, campaignId);
    const saved = await this.inScene(campaignId, async ({ daos, scene }) => {
      const token = await controlledToken(daos, scene, access, command.tokenId);
      const removed = await daos.conditions.remove(token.token.id, command.activeConditionId);
      if (!removed) throw new ConditionNotFoundError(campaignId, command.activeConditionId);
    });
    const { tokenId, activeConditionId } = command;
    this.deps.publisher.conditionRemoved({
      ...this.base(campaignId, saved.version),
      tokenId,
      activeConditionId,
    });
    return saved.version;
  }

  private async accessOf(userId: string, campaignId: string): Promise<CampaignAccessBo> {
    const membership = await this.deps.members.findMembership(campaignId, userId);
    const access = toCampaignAccessBo(campaignId, userId, membership);
    access.requireMember();
    return access;
  }

  private inScene<T>(campaignId: string, work: (locked: Locked) => Promise<T>): Promise<Saved<T>> {
    return this.deps.transaction(async (daos) => {
      const scene = await lockedScene(daos, campaignId);
      const value = await work({ daos, scene });
      return { value, version: await daos.scenes.bumpVersion(scene.id) };
    });
  }

  private base(campaignId: string, version: number): EventBase {
    return { campaignId, version, at: this.deps.clock.now().toISOString() };
  }
}

async function lockedScene(daos: ConditionWriteDaos, campaignId: string): Promise<ScenePo> {
  const scene = await daos.scenes.lockActiveOf(campaignId);
  if (!scene) throw new Error(`campaign ${campaignId} has no active scene; every campaign has one`);
  return scene;
}

async function controlledToken(
  daos: ConditionWriteDaos,
  scene: ScenePo,
  access: CampaignAccessBo,
  tokenId: string,
): Promise<TokenRow> {
  const token = await daos.tokens.findInScene(scene.id, tokenId);
  if (!token) throw new TokenNotFoundError(scene.campaignId, tokenId);
  const control = { tokenId, controllerIds: token.controllerIds };
  new TokenAccessBo(access, control).requireControl('change the conditions of');
  return token;
}
