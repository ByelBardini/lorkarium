import type {
  FaceTokensCommandDto,
  ResizeTokensCommandDto,
  RestyleTokensCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { inLockedGrid } from '../scenes/locked-scene';
import { placeInScene, requireBox, requireFacing } from './token-rules.bo';
import type { TokenBoxPo, TokenRow } from './tokens.dao';
import type { TokenStylePo } from './tokens.po';
import { splitStyle, stateHolderIdOf } from './linked-token';
import {
  inLockedGridWithCast,
  requireCastLock,
  type CastAndGridChange,
  type LockedGridMaybeCast,
} from '../scenes/locked-cast';
import {
  requireAssetsOf,
  tokenAccessOf,
  tokensIn,
  type TokenTransactionRunner,
  type TokenWriteDaos,
} from './token-transaction';

type Envelope = 'actionId' | 'campaignId';
export type FaceTokens = Omit<FaceTokensCommandDto, Envelope>;
export type RestyleTokens = Omit<RestyleTokensCommandDto, Envelope>;
export type ResizeTokens = Omit<ResizeTokensCommandDto, Envelope>;

export type TokenAppearanceServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

/** Where a group of tokens looks and how it looks, on the grid the command names, all or nothing
 *  in one version; neither is a secret, so everyone with that grid open gets the same event
 *  after the commit.
 *
 *  Example: `await appearance.faceMany(user.id, campaignId, { faces: [{ tokenId, facing: 45 }] })` */
export class TokenAppearanceService {
  constructor(private readonly deps: TokenAppearanceServiceDeps) {}

  /** Turning is moving: the master, or a controller of a token on the `tokens` layer. A turn with
   *  `expect` (the undo) is `STALE_UNDO` once someone turned the token since. */
  async faceMany(userId: string, campaignId: string, command: FaceTokens): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const faces = command.faces.map(({ tokenId, facing }) => ({ tokenId, facing }));
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGrid(this.deps.transaction, address, async ({ daos, scene }) => {
      const ids = command.faces.map((face) => face.tokenId);
      const rows = await tokensIn(daos, scene, campaignId, ids);
      rows.forEach((row, index) => {
        tokenAccessOf(access, row).requireMove('turn', row.token.layer);
        requireFacing(row.token.id, command.faces[index]?.expect?.facing, row.token.facing);
      });
      await daos.tokens.faceMany(scene.id, faces);
    });
    const at = this.deps.clock.now().toISOString();
    const { version, sceneId } = saved;
    this.deps.publisher.tokensFaced({ campaignId, sceneId, version, at, faces });
    return saved.version;
  }

  /** The look is the controllers' to choose, on any layer (like the bars). On a linked token
   *  the image, frame and defeat mark are its anchor's (an event of the cast); the flips and the
   *  light switch stay its own in the grid. */
  async restyleMany(userId: string, campaignId: string, command: RestyleTokens): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGridWithCast(this.deps.transaction, address, async (locked) => {
      const rows = await tokensIn(locked.daos, locked.scene, campaignId, command.tokenIds);
      for (const row of rows) tokenAccessOf(access, row).requireControl('restyle');
      await requireAssetsOf(locked.daos, campaignId, [command.style.imageAssetId]);
      return restyleIn(locked, rows, command.style);
    });
    const at = this.deps.clock.now().toISOString();
    const { grid, cast } = saved.value;
    if (saved.cast && cast)
      this.deps.publisher.tokensRestyled({ campaignId, ...saved.cast, at, ...cast });
    if (saved.grid && grid)
      this.deps.publisher.tokensRestyled({ campaignId, ...saved.grid, at, ...grid });
    return saved.version;
  }

  /** The size is the controllers' to choose, on any layer (like the look). The box must fit the
   *  scene, and a resize with `expect` (the undo) is `STALE_UNDO` once the box changed since. */
  async resizeMany(userId: string, campaignId: string, command: ResizeTokens): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const resizes = command.resizes.map(boxOf);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGrid(this.deps.transaction, address, async ({ daos, scene }) => {
      const rows = await tokensIn(
        daos,
        scene,
        campaignId,
        resizes.map((box) => box.tokenId),
      );
      rows.forEach((row, index) => {
        tokenAccessOf(access, row).requireControl('resize');
        const resize = command.resizes[index];
        if (resize) placeInScene(scene, resize, resize);
        requireBox(row.token.id, resize?.expect, row.token);
      });
      await daos.tokens.resizeMany(scene.id, resizes);
    });
    const at = this.deps.clock.now().toISOString();
    const { version, sceneId } = saved;
    this.deps.publisher.tokensResized({ campaignId, sceneId, version, at, resizes });
    return saved.version;
  }
}

type Restyled = Readonly<{ tokenIds: string[]; style: Partial<TokenStylePo> }>;

// Unlinked tokens take the whole style; linked ones their own part, their anchors the shared one.
async function restyleIn(
  locked: LockedGridMaybeCast<TokenWriteDaos>,
  rows: readonly TokenRow[],
  style: Partial<TokenStylePo>,
): Promise<CastAndGridChange<Readonly<{ grid: Restyled | null; cast: Restyled | null }>>> {
  const { shared, own } = splitStyle(style);
  const loose = rows.filter(({ token }) => token.anchorTokenId === null).map(idOf);
  const linked = rows.filter(({ token }) => token.anchorTokenId !== null);
  const anchors = Object.keys(shared).length > 0 ? linked.map(stateHolderIdOf) : [];
  if (anchors.length > 0) requireCastLock(locked);
  const ownIds = Object.keys(own).length > 0 ? linked.map(idOf) : [];
  if (loose.length > 0) await locked.daos.tokens.restyle(loose, style);
  if (ownIds.length > 0) await locked.daos.tokens.restyle(ownIds, own);
  if (anchors.length > 0) await locked.daos.tokens.restyle(anchors, shared);
  const gridIds = [...loose, ...ownIds];
  const grid =
    gridIds.length > 0 ? { tokenIds: gridIds, style: loose.length > 0 ? style : own } : null;
  const cast = anchors.length > 0 ? { tokenIds: anchors, style: shared } : null;
  return { value: { grid, cast }, grid: grid !== null, cast: cast !== null };
}

function idOf({ token }: TokenRow): string {
  return token.id;
}

function boxOf({ tokenId, col, row, width, height }: TokenBoxPo): TokenBoxPo {
  return { tokenId, col, row, width, height };
}
