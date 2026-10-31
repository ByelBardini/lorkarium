import type { SheetHolderDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { UsersDao } from '../auth/users.dao';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { MemberCardsDao } from '../member-cards/member-cards.dao';
import { toMemberCardDto } from '../member-cards/member-cards.mapper';
import type { MemberCardPo } from '../member-cards/member-cards.po';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { savedEventBase, type SavedVersion } from '../scenes/locked-cast';
import type { SceneRow, ScenesDao } from '../scenes/scenes.dao';
import { CharacterLinkBo } from '../tokens/character-link.bo';
import { publishTokenChange } from '../tokens/token-veil';
import type { TokenRow, TokensDao } from '../tokens/tokens.dao';
import { TokenNotFoundError } from '../tokens/tokens.error';
import { SheetItemBo } from './sheet-item.bo';
import type { SheetsDao, TokenPlacePo } from './sheets.dao';

/** What resolving a holder reads and writes, on the sheet's transaction. */
export type SheetHolderDaos = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  sheets: Pick<SheetsDao, 'placeOf'>;
  scenes: Pick<ScenesDao, 'lockCastOf' | 'bumpVersion'>;
  tokens: Pick<TokensDao, 'insert'>;
  memberCards: Pick<MemberCardsDao, 'findOfMember' | 'save'>;
  users: Pick<UsersDao, 'findById'>;
}>;

/** The anchor a sheet given to a player created, with the cast version of its `token:created`,
 *  and the card that now points at it with the version of its `member:cardChanged`. */
export type CreatedAnchor = Readonly<{
  anchor: TokenRow;
  createdIn: SavedVersion;
  card: MemberCardPo;
  cardIn: SavedVersion;
}>;

/** Where a sheet goes: the place of the token that holds it (`null` = nobody) and the anchor it
 *  had to create, if any. */
export type ResolvedHolder = Readonly<{
  place: TokenPlacePo | null;
  created: CreatedAnchor | null;
}>;

export type SheetHolderServiceDeps = Readonly<{
  publisher: Pick<BoardPublisherPort, 'tokenChanged' | 'veiledLightsChanged' | 'memberCardChanged'>;
  clock: ClockPort;
}>;

const NOBODY: ResolvedHolder = { place: null, created: null };

/** Who holds a sheet, resolved inside the sheet's transaction (the table already locked): a
 *  token gives it to its anchor when linked; a player gives it to their character's anchor, made
 *  in the cast from their card when they have none (as the first `token:linkToCard` does). The
 *  cast is locked before the card is read, as the board's link does.
 *
 *  Example: `const { place, created } = await holders.resolve(daos, campaignId, { memberId: biaId })` */
export class SheetHolderService {
  constructor(private readonly deps: SheetHolderServiceDeps) {}

  async resolve(
    daos: SheetHolderDaos,
    campaignId: string,
    holder: SheetHolderDto | null,
  ): Promise<ResolvedHolder> {
    if (!holder) return NOBODY;
    if ('tokenId' in holder)
      return { place: await this.tokenPlaceOf(daos, campaignId, holder.tokenId), created: null };
    return this.characterOf(daos, campaignId, holder.memberId);
  }

  /** After the commit: the new anchor to the cast's rooms, then the card that points at it. */
  publishCreated(campaignId: string, created: CreatedAnchor | null): void {
    if (!created) return;
    const { clock, publisher } = this.deps;
    const token = { row: created.anchor, conditions: [] };
    const base = savedEventBase(campaignId, created.createdIn, clock);
    publishTokenChange(publisher, 'token:created', base, token, null);
    const card = toMemberCardDto(created.card);
    publisher.memberCardChanged({ ...savedEventBase(campaignId, created.cardIn, clock), card });
  }

  // The token that holds the sheet: the anchor of a linked token, the token itself otherwise.
  private async tokenPlaceOf(
    daos: SheetHolderDaos,
    campaignId: string,
    tokenId: string,
  ): Promise<TokenPlacePo> {
    const place = await daos.sheets.placeOf(campaignId, tokenId);
    if (!place) throw new TokenNotFoundError(campaignId, tokenId);
    if (!place.anchorTokenId) return place;
    return this.tokenPlaceOf(daos, campaignId, place.anchorTokenId);
  }

  private async characterOf(
    daos: SheetHolderDaos,
    campaignId: string,
    memberId: string,
  ): Promise<ResolvedHolder> {
    const membership = await daos.members.findMembership(campaignId, memberId);
    new CharacterLinkBo(campaignId).requirePlayer(memberId, membership?.role ?? null);
    const cast = await daos.scenes.lockCastOf(campaignId);
    if (!cast) throw new Error(`campaign ${campaignId} has no cast; every campaign has one`);
    const card = await daos.memberCards.findOfMember(campaignId, memberId);
    const anchorId = card?.anchorTokenId ?? null;
    if (anchorId)
      return { place: await this.tokenPlaceOf(daos, campaignId, anchorId), created: null };
    const created = await this.newAnchor(daos, cast, memberId, card?.characterName ?? null);
    return { place: await this.tokenPlaceOf(daos, campaignId, created.anchor.token.id), created };
  }

  // The anchor gets its own cast version for `token:created`; the card takes the next one.
  private async newAnchor(
    daos: SheetHolderDaos,
    cast: SceneRow,
    memberId: string,
    characterName: string | null,
  ): Promise<CreatedAnchor> {
    const member = await daos.users.findById(memberId);
    if (!member)
      throw new Error(`member ${memberId} of campaign ${cast.campaignId} has no account`);
    const identity = new SheetItemBo(cast.campaignId).anchorIdentityOf(characterName, member.name);
    const token = { sceneId: cast.id, ...identity, width: 1, height: 1, col: 0, row: 0 };
    const anchor = await daos.tokens.insert({ token, bars: [], controllerIds: [memberId] });
    const createdIn = { sceneId: cast.id, version: await daos.scenes.bumpVersion(cast.id) };
    const anchorTokenId = anchor.token.id;
    const card = await daos.memberCards.save(cast.campaignId, memberId, { anchorTokenId });
    const cardIn = { sceneId: cast.id, version: await daos.scenes.bumpVersion(cast.id) };
    return { anchor, createdIn, card, cardIn };
  }
}
