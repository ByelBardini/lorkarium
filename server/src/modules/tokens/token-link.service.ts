import { changeSceneOf, publishTokenChange, type ChangeScene } from './token-veil';
import type {
  LinkTokenToCardCommandDto,
  UnlinkTokenFromCardCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import { toMemberCardDto } from '../member-cards/member-cards.mapper';
import type { MemberCardPo } from '../member-cards/member-cards.po';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import {
  inLockedCastAndGrid,
  savedEventBase,
  type CastAndGridChange,
  type LockedCastAndGrid,
  type SavedVersion,
} from '../scenes/locked-cast';
import type { SceneRow } from '../scenes/scenes.dao';
import { CharacterLinkBo } from './character-link.bo';
import { identityOf } from './linked-token';
import {
  tokenIn,
  withConditions,
  type TokenTransactionRunner,
  type TokenWithConditions,
  type TokenWriteDaos,
} from './token-transaction';
import type { NewTokenRow, TokenRow } from './tokens.dao';

type Envelope = 'actionId' | 'campaignId';
export type LinkTokenToCard = Omit<LinkTokenToCardCommandDto, Envelope>;
export type UnlinkTokenFromCard = Omit<UnlinkTokenFromCardCommandDto, Envelope>;

export type TokenLinkServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

type Locked = LockedCastAndGrid<TokenWriteDaos>;

/** The anchor a first link created, the cast version of its `token:created` and the card that
 *  now points at it (its `member:cardChanged` takes the cast version the commit gives). */
type NewAnchor = Readonly<{
  anchor: TokenWithConditions;
  createdIn: SavedVersion;
  card: MemberCardPo;
}>;
type Linked = Readonly<{
  token: TokenWithConditions;
  created: NewAnchor | null;
  veiled: ChangeScene;
}>;
type Unlinked = Readonly<{ token: TokenWithConditions; veiled: ChangeScene }>;

/** Links a grid token to a player's card (the character) and back, master only. The cast is
 *  locked before the grid; the grid token's change goes to the grid, a new anchor and the card to
 *  the cast (which every member follows).
 *
 *  Example: `await tokenLink.link(ana.id, campaignId, { sceneId, tokenId: lyraId, memberId: biaId })` */
export class TokenLinkService {
  constructor(private readonly deps: TokenLinkServiceDeps) {}

  /** The first link of a card creates its anchor in the cast with the token's identity, size,
   *  bars, conditions and controllers; a later one (another grid) drops the token's own and
   *  adopts the anchor's. MEMBER_NOT_FOUND for a card that is not a player's;
   *  CHARACTER_ALREADY_PLACED when the token already is a character or the grid already has the
   *  card's. */
  async link(userId: string, campaignId: string, command: LinkTokenToCard): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('link a token to a card');
    const rules = new CharacterLinkBo(campaignId);
    const membership = await this.deps.members.findMembership(campaignId, command.memberId);
    rules.requirePlayer(command.memberId, membership?.role ?? null);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedCastAndGrid(this.deps.transaction, address, (locked) =>
      this.linkIn(locked, rules, command),
    );
    const created = saved.value.created;
    if (created) this.publishAnchor(campaignId, created, saved.cast);
    if (saved.grid)
      this.publishToken(campaignId, saved.value.token, saved.grid, saved.value.veiled);
    return saved.version;
  }

  /** The token keeps a copy of what it showed (the anchor's identity, bars, conditions and
   *  controllers) and stops following the anchor, which stays. TOKEN_NOT_LINKED otherwise. */
  async unlink(userId: string, campaignId: string, command: UnlinkTokenFromCard): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('unlink a token from its card');
    const rules = new CharacterLinkBo(campaignId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedCastAndGrid(this.deps.transaction, address, (locked) =>
      this.unlinkIn(locked, rules, access, command.tokenId),
    );
    if (saved.grid)
      this.publishToken(campaignId, saved.value.token, saved.grid, saved.value.veiled);
    return saved.version;
  }

  private async linkIn(
    { daos, scene, cast }: Locked,
    rules: CharacterLinkBo,
    { tokenId, memberId }: LinkTokenToCard,
  ): Promise<CastAndGridChange<Linked>> {
    const found = await tokenIn(daos, scene, scene.campaignId, tokenId);
    rules.requireFree(found.token);
    const card = await daos.memberCards.findOfMember(scene.campaignId, memberId);
    const anchorId = card?.anchorTokenId ?? null;
    if (anchorId) {
      const placed = await daos.tokens.findLinkedInScene(scene.id, anchorId);
      rules.requireNotPlaced(tokenId, memberId, placed?.token);
      await daos.anchors.dropState(tokenId);
      await daos.anchors.linkToAnchor(tokenId, anchorId);
      const token = await this.reread(daos, scene, tokenId);
      const veiled = await changeSceneOf(daos, scene, found, token.row, false);
      return { value: { token, created: null, veiled }, grid: true, cast: false };
    }
    const created = await this.newAnchor(daos, cast, found, memberId);
    const token = await this.reread(daos, scene, tokenId);
    const veiled = await changeSceneOf(daos, scene, found, token.row, false);
    return { value: { token, created, veiled }, grid: true, cast: true };
  }

  // The anchor gets its own cast version for `token:created`; the card takes the commit's.
  private async newAnchor(
    daos: TokenWriteDaos,
    cast: SceneRow,
    found: TokenRow,
    memberId: string,
  ): Promise<NewAnchor> {
    const anchor = await daos.tokens.insert(anchorRowOf(cast.id, found));
    await daos.anchors.moveStateTo(found.token.id, anchor.token.id);
    await daos.anchors.linkToAnchor(found.token.id, anchor.token.id);
    const createdIn = { sceneId: cast.id, version: await daos.scenes.bumpVersion(cast.id) };
    const card = await daos.memberCards.save(cast.campaignId, memberId, {
      anchorTokenId: anchor.token.id,
    });
    const moved = await tokenIn(daos, cast, cast.campaignId, anchor.token.id);
    return { anchor: await withConditions(daos, moved), createdIn, card };
  }

  private async unlinkIn(
    { daos, scene }: Locked,
    rules: CharacterLinkBo,
    access: CampaignAccessBo,
    tokenId: string,
  ): Promise<CastAndGridChange<Unlinked>> {
    const found = await tokenIn(daos, scene, access.campaignIdOf(), tokenId);
    const anchorId = rules.anchorOf(found.token);
    await daos.anchors.copyStateTo(anchorId, tokenId);
    await daos.anchors.unlinkWith(tokenId, identityOf(found.token));
    const token = await this.reread(daos, scene, tokenId);
    const veiled = await changeSceneOf(daos, scene, found, token.row, false);
    return { value: { token, veiled }, grid: true, cast: false };
  }

  private async reread(
    daos: TokenWriteDaos,
    scene: SceneRow,
    tokenId: string,
  ): Promise<TokenWithConditions> {
    return withConditions(daos, await tokenIn(daos, scene, scene.campaignId, tokenId));
  }

  private publishAnchor(campaignId: string, created: NewAnchor, cast: SavedVersion | null): void {
    this.publishToken(campaignId, created.anchor, created.createdIn, null, 'token:created');
    if (!cast) return;
    const base = savedEventBase(campaignId, cast, this.deps.clock);
    this.deps.publisher.memberCardChanged({ ...base, card: toMemberCardDto(created.card) });
  }

  private publishToken(
    campaignId: string,
    token: TokenWithConditions,
    saved: SavedVersion,
    veiled: ChangeScene | null = null,
    name: 'token:created' | 'token:updated' = 'token:updated',
  ): void {
    const base = savedEventBase(campaignId, saved, this.deps.clock);
    publishTokenChange(this.deps.publisher, name, base, token, veiled);
  }
}

// The anchor stands in the cast with the character's identity and size; nothing draws it.
function anchorRowOf(castId: string, found: TokenRow): NewTokenRow {
  const { width, height } = found.token;
  const token = { sceneId: castId, ...identityOf(found.token), width, height, col: 0, row: 0 };
  return { token, bars: [], controllerIds: [] };
}
