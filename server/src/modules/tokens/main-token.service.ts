import type { SetMainTokenCommandDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { inLockedScene } from '../scenes/locked-scene';
import { tokenAccessOf, tokenIn, type TokenTransactionRunner } from './token-transaction';

export type SetMainToken = Omit<SetMainTokenCommandDto, 'actionId' | 'campaignId'>;

export type MainTokenServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

/** The token a person's dock shows when nothing is selected, chosen among the ones they are
 *  listed in the control of; one per person per scene, and the whole table hears of it.
 *
 *  Example: `await mainToken.choose(user.id, campaignId, { tokenId })` */
export class MainTokenService {
  constructor(private readonly deps: MainTokenServiceDeps) {}

  /** One's own main token takes being listed in its control (the master's power does not count);
   *  with `playerId`, the master chooses for that player, who must be listed. */
  async choose(userId: string, campaignId: string, command: SetMainToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const { tokenId } = command;
    const playerId = command.playerId ?? userId;
    const saved = await inLockedScene(
      this.deps.transaction,
      campaignId,
      async ({ daos, scene }) => {
        const found = await tokenIn(daos, scene, campaignId, tokenId);
        tokenAccessOf(access, found).requireChooseMainFor(playerId);
        await daos.mainTokens.choose(scene.id, playerId, tokenId);
      },
    );
    const at = this.deps.clock.now().toISOString();
    this.deps.publisher.mainTokenChanged({
      campaignId,
      version: saved.version,
      at,
      userId: playerId,
      tokenId,
    });
    return saved.version;
  }
}
