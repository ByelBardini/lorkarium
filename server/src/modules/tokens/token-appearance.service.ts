import type { FaceTokensCommandDto, RestyleTokensCommandDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { inLockedScene } from '../scenes/locked-scene';
import { requireFacing } from './token-rules.bo';
import {
  requireAssetsOf,
  tokenAccessOf,
  tokensIn,
  type TokenTransactionRunner,
} from './token-transaction';

type Envelope = 'actionId' | 'campaignId';
export type FaceTokens = Omit<FaceTokensCommandDto, Envelope>;
export type RestyleTokens = Omit<RestyleTokensCommandDto, Envelope>;

export type TokenAppearanceServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

/** Where a group of tokens looks and how it looks, all or nothing in one version; neither is a
 *  secret, so the whole table gets the same event after the commit.
 *
 *  Example: `await appearance.faceMany(user.id, campaignId, { faces: [{ tokenId, facing: 45 }] })` */
export class TokenAppearanceService {
  constructor(private readonly deps: TokenAppearanceServiceDeps) {}

  /** Turning is moving: the master, or a controller of a token on the `tokens` layer. A turn with
   *  `expect` (the undo) is `STALE_UNDO` once someone turned the token since. */
  async faceMany(userId: string, campaignId: string, command: FaceTokens): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const faces = command.faces.map(({ tokenId, facing }) => ({ tokenId, facing }));
    const saved = await inLockedScene(
      this.deps.transaction,
      campaignId,
      async ({ daos, scene }) => {
        const ids = command.faces.map((face) => face.tokenId);
        const rows = await tokensIn(daos, scene, campaignId, ids);
        rows.forEach((row, index) => {
          tokenAccessOf(access, row).requireMove('turn', row.token.layer);
          requireFacing(row.token.id, command.faces[index]?.expect?.facing, row.token.facing);
        });
        await daos.tokens.faceMany(faces);
      },
    );
    const at = this.deps.clock.now().toISOString();
    this.deps.publisher.tokensFaced({ campaignId, version: saved.version, at, faces });
    return saved.version;
  }

  /** The look is the controllers' to choose, on any layer (like the bars). */
  async restyleMany(userId: string, campaignId: string, command: RestyleTokens): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const { tokenIds, style } = command;
    const saved = await inLockedScene(
      this.deps.transaction,
      campaignId,
      async ({ daos, scene }) => {
        const rows = await tokensIn(daos, scene, campaignId, tokenIds);
        for (const row of rows) tokenAccessOf(access, row).requireControl('restyle');
        await requireAssetsOf(daos, campaignId, [style.imageAssetId]);
        await daos.tokens.restyle(tokenIds, style);
      },
    );
    const at = this.deps.clock.now().toISOString();
    this.deps.publisher.tokensRestyled({ campaignId, version: saved.version, at, tokenIds, style });
    return saved.version;
  }
}
