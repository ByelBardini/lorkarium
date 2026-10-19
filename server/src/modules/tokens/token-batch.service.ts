import type { CreateTokensCommandDto, DeleteTokensCommandDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { inLockedScene, type CreatedInScene } from '../scenes/locked-scene';
import type { ScenePo } from '../scenes/scenes.po';
import { TokenRulesBo } from './token-rules.bo';
import {
  audiencesOf,
  combatOf,
  joinPastedToCombat,
  newTokenRowOf,
  requireAssetsOf,
  leaveCombat,
  tokensIn,
  withConditions,
  type TokenTransactionRunner,
  type TokenWithConditions,
} from './token-transaction';

type Envelope = 'actionId' | 'campaignId';
export type CreateTokens = Omit<CreateTokensCommandDto, Envelope>;
export type DeleteTokens = Omit<DeleteTokensCommandDto, Envelope>;

export type TokenBatchServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership' | 'listMembers'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** `BAR_VALUE_LIMIT`, handed to the rule. */
  barLimit: number;
}>;

/** The token batches of a paste and of its undo (master only): all or nothing in one version,
 *  published once after the commit.
 *
 *  Example: `const version = await tokenBatch.createMany(user.id, campaignId, { tokens })` */
export class TokenBatchService {
  constructor(private readonly deps: TokenBatchServiceDeps) {}

  /** Creates 1 to 64 tokens; one outside the scene or with a stranger as controller refuses all.
   *  A copy whose original is in the combat joins that entry, in the same version. */
  async createMany(
    userId: string,
    campaignId: string,
    command: CreateTokens,
  ): Promise<CreatedInScene> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('create tokens');
    const members = await this.deps.members.listMembers(campaignId);
    const memberIds = members.map((member) => member.userId);
    const saved = await inLockedScene(
      this.deps.transaction,
      campaignId,
      async ({ daos, scene }) => {
        const rules = this.rulesFor(scene, memberIds);
        const rows = command.tokens.map((token) => newTokenRowOf(scene.id, rules, token));
        await requireAssetsOf(
          daos,
          campaignId,
          command.tokens.map((token) => token.imageAssetId),
        );
        const created = await daos.tokens.insertMany(rows);
        const pasted = created.map(({ token }, index) => ({
          tokenId: token.id,
          combatantId: command.tokens[index]?.combatantId,
        }));
        await joinPastedToCombat(daos, scene, access, pasted);
        const withAll: TokenWithConditions[] = [];
        for (const row of created) withAll.push(await withConditions(daos, row));
        return { tokens: withAll, combat: await combatOf(daos, scene) };
      },
    );
    this.deps.publisher.tokensCreated({
      campaignId,
      version: saved.version,
      at: this.now(),
      tokens: saved.value.tokens.map(audiencesOf),
      combat: saved.value.combat,
    });
    const createdIds = saved.value.tokens.map(({ row }) => row.token.id);
    return { version: saved.version, createdIds };
  }

  /** Deletes 1 to 64 tokens; `expect` (undoing a paste) must still match where each one is, and
   *  the turn passes past every deleted combatant in the same transaction. */
  async deleteMany(userId: string, campaignId: string, command: DeleteTokens): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('delete tokens');
    const { tokenIds } = command;
    const saved = await inLockedScene(
      this.deps.transaction,
      campaignId,
      async ({ daos, scene }) => {
        const rows = await tokensIn(daos, scene, campaignId, tokenIds);
        const rules = this.rulesFor(scene, []);
        for (const { token } of rows) {
          const expected = command.expect?.find(({ tokenId }) => tokenId === token.id);
          rules.requireAt(token.id, expected, token);
        }
        await leaveCombat(daos, scene, access, tokenIds);
        await daos.tokens.deleteMany(scene.id, tokenIds);
        return combatOf(daos, scene);
      },
    );
    this.deps.publisher.tokensDeleted({
      campaignId,
      version: saved.version,
      at: this.now(),
      tokenIds: [...tokenIds],
      combat: saved.value,
    });
    return saved.version;
  }

  private rulesFor(scene: ScenePo, memberIds: readonly string[]): TokenRulesBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    return new TokenRulesBo({ scene: sceneSize, memberIds, barLimit: this.deps.barLimit });
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}
