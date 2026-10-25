import { NO_VEIL, cutsOf, entriesSeenBy, tokenIdsSeenBy, veilOf } from './token-veil.mapper';
import { publishVeiledLights, veiledWriteOf, type VeiledWrite } from './token-veil';
import type { GridEvent } from '../scenes/board-publisher.port';
import type {
  FaceTokensCommandDto,
  ResizeTokensCommandDto,
  RestyleTokensCommandDto,
  TokenStyleDto,
  TokensFacedDto,
  TokensResizedDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { inLockedGrid } from '../scenes/locked-scene';
import { placeInScene, requireBox, requireFacing } from './token-rules.bo';
import type { TokenBoxPo, TokenRow } from './tokens.dao';
import { lookAssetIdsOf, toTokenStylePo } from './token-aura.mapper';
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
      const faced = rows.map((row, index) => withFields(row, { facing: faces[index]?.facing }));
      return veiledWriteOf(daos, scene.id, faced);
    });
    const at = this.deps.clock.now().toISOString();
    const { version, sceneId } = saved;
    const event = { campaignId, sceneId, version, at, faces };
    this.deps.publisher.tokensFaced(event, cutsOf(event, saved.value.veil, FACES_SEEN_BY));
    publishVeiledLights(this.deps.publisher, { campaignId, sceneId, at }, saved.value.lights);
    return saved.version;
  }

  /** The look is the controllers' to choose, on any layer (like the bars). On a linked token
   *  the image, frame, defeat mark and aura are its anchor's (an event of the cast); the flips and
   *  the light switch stay its own in the grid. Every image (the token's, the aura's) must be an
   *  asset of the table. */
  async restyleMany(userId: string, campaignId: string, command: RestyleTokens): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedGridWithCast(this.deps.transaction, address, async (locked) => {
      const rows = await tokensIn(locked.daos, locked.scene, campaignId, command.tokenIds);
      for (const row of rows) tokenAccessOf(access, row).requireControl('restyle');
      await requireAssetsOf(locked.daos, campaignId, lookAssetIdsOf(command.style));
      const restyled = await restyleIn(locked, rows, command.style);
      const veiled = await litWriteOf(locked.daos, locked.scene.id, rows, command.style);
      return { ...restyled, value: { ...restyled.value, veiled } };
    });
    const at = this.deps.clock.now().toISOString();
    const { grid, cast, veiled } = saved.value;
    if (saved.cast && cast)
      this.deps.publisher.tokensRestyled({ campaignId, ...saved.cast, at, ...cast }, NO_VEIL);
    if (saved.grid && grid) {
      const event = { campaignId, ...saved.grid, at, ...grid };
      this.deps.publisher.tokensRestyled(event, cutsOf(event, veiled.veil, tokenIdsSeenBy));
      const address = { campaignId, sceneId: saved.grid.sceneId, at };
      publishVeiledLights(this.deps.publisher, address, veiled.lights);
    }
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
      const resized = rows.map((row, index) => withFields(row, resizes[index] ?? {}));
      return veiledWriteOf(daos, scene.id, resized);
    });
    const at = this.deps.clock.now().toISOString();
    const { version, sceneId } = saved;
    const event = { campaignId, sceneId, version, at, resizes };
    this.deps.publisher.tokensResized(event, cutsOf(event, saved.value.veil, RESIZES_SEEN_BY));
    publishVeiledLights(this.deps.publisher, { campaignId, sceneId, at }, saved.value.lights);
    return saved.version;
  }
}

type Restyled = Readonly<{ tokenIds: string[]; style: TokenStyleDto }>;

// Unlinked tokens take the whole style; linked ones their own part, their anchors the shared one.
async function restyleIn(
  locked: LockedGridMaybeCast<TokenWriteDaos>,
  rows: readonly TokenRow[],
  style: TokenStyleDto,
): Promise<CastAndGridChange<Readonly<{ grid: Restyled | null; cast: Restyled | null }>>> {
  const { shared, own } = splitStyle(style);
  const loose = rows.filter(({ token }) => token.anchorTokenId === null).map(idOf);
  const linked = rows.filter(({ token }) => token.anchorTokenId !== null);
  const anchors = Object.keys(shared).length > 0 ? linked.map(stateHolderIdOf) : [];
  if (anchors.length > 0) requireCastLock(locked);
  const ownIds = Object.keys(own).length > 0 ? linked.map(idOf) : [];
  const { tokens } = locked.daos;
  if (loose.length > 0) await tokens.restyle(loose, toTokenStylePo(style));
  if (ownIds.length > 0) await tokens.restyle(ownIds, toTokenStylePo(own));
  if (anchors.length > 0) await tokens.restyle(anchors, toTokenStylePo(shared));
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

const FACES_SEEN_BY = entriesSeenBy<GridEvent<TokensFacedDto>>('faces');
const RESIZES_SEEN_BY = entriesSeenBy<GridEvent<TokensResizedDto>>('resizes');

// The row as the write left it (a light shines from where, and toward where, the token now is).
function withFields(row: TokenRow, fields: Partial<TokenRow['token']>): TokenRow {
  const defined = Object.entries(fields).filter(([, value]) => value !== undefined);
  return { ...row, token: { ...row.token, ...Object.fromEntries(defined) } };
}

// The veil of a restyle; the veiled lights only when the light was lit or put out.
async function litWriteOf(
  daos: TokenWriteDaos,
  sceneId: string,
  rows: readonly TokenRow[],
  style: TokenStyleDto,
): Promise<VeiledWrite> {
  if (style.lightLit === undefined) return { veil: veilOf(rows), lights: null };
  return veiledWriteOf(
    daos,
    sceneId,
    rows.map((row) => withFields(row, { lightLit: style.lightLit })),
  );
}
