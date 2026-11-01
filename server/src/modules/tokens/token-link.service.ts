import { changeSceneOf, publishTokenChange, type ChangeScene } from './token-veil';
import type {
  LinkTokenToCardCommandDto,
  LinkTokenToCharacterCommandDto,
  UnlinkTokenFromCharacterCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { MemberNotFoundError } from '../campaigns/campaigns.error';
import { memberAccessOf } from '../campaigns/member-access';
import type { CharacterRow } from '../characters/characters.dao';
import {
  inLockedCharactersAndGrid,
  type CharactersAndGridChange,
  type LockedGridMaybeCharacters,
  type SavedInCharactersAndGrid,
} from '../characters/locked-characters-grid';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { savedEventBase } from '../scenes/locked-cast';
import type { ScenePo } from '../scenes/scenes.po';
import { CharacterLinkBo } from './character-link.bo';
import { characterIn, identityOf } from './linked-token';
import {
  tokenIn,
  withConditions,
  type TokenTransactionRunner,
  type TokenWithConditions,
  type TokenWriteDaos,
} from './token-transaction';
import type { TokenRow } from './tokens.dao';

type Envelope = 'actionId' | 'campaignId';
export type LinkTokenToCharacter = Omit<LinkTokenToCharacterCommandDto, Envelope>;
export type UnlinkTokenFromCharacter = Omit<UnlinkTokenFromCharacterCommandDto, Envelope>;
export type LinkTokenToCard = Omit<LinkTokenToCardCommandDto, Envelope>;

export type TokenLinkServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

type Locked = LockedGridMaybeCharacters<TokenWriteDaos>;
type Relinked = Readonly<{ token: TokenWithConditions; veiled: ChangeScene }>;
type TokenAddress = Readonly<{ sceneId?: string | undefined; tokenId: string }>;
// How a link names its character, read in the transaction: by its id, or by its player.
type CharacterTarget = (daos: TokenWriteDaos) => Promise<CharacterRow>;

/** Links a grid token to a character of the table and back, master only. The characters are
 *  locked before the grid; only the grid gets a version (the character does not change), and
 *  the token goes to the grid as `token:updated`, each audience its own.
 *
 *  Example: `await tokenLink.link(ana.id, campaignId, { sceneId, tokenId: kaelId, characterId: lyraId })` */
export class TokenLinkService {
  constructor(private readonly deps: TokenLinkServiceDeps) {}

  /** The token wears the character: its own bars, conditions and controllers go.
   *  CHARACTER_ALREADY_PLACED when the token already wears one or the grid already has the
   *  character's; CHARACTER_NOT_FOUND for a character of another table. */
  async link(userId: string, campaignId: string, command: LinkTokenToCharacter): Promise<number> {
    const { characterId, ...token } = command;
    return this.linkTo(userId, campaignId, token, (daos) =>
      characterIn(daos, campaignId, characterId),
    );
  }

  /** The old link to a player's card (`token:linkToCard`, gone in phase 13 of the plan): the
   *  character of the card's player. MEMBER_NOT_FOUND for a member without one (the master, a
   *  stranger). */
  async linkToCard(userId: string, campaignId: string, command: LinkTokenToCard): Promise<number> {
    const { memberId, ...token } = command;
    return this.linkTo(userId, campaignId, token, async (daos) => {
      const found = await daos.characters.findOfUser(campaignId, memberId);
      if (!found) throw new MemberNotFoundError(campaignId, memberId);
      return found;
    });
  }

  /** The token keeps a copy of what it showed (the character's identity, bars, controllers and
   *  conditions) and stops wearing the character, which stays. TOKEN_NOT_LINKED otherwise. */
  async unlink(
    userId: string,
    campaignId: string,
    command: UnlinkTokenFromCharacter,
  ): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('unlink a token from its character');
    const rules = new CharacterLinkBo(campaignId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedCharactersAndGrid(this.deps.transaction, address, (locked) =>
      this.unlinkIn(locked, rules, command.tokenId),
    );
    return this.published(campaignId, saved);
  }

  private async linkTo(
    userId: string,
    campaignId: string,
    command: TokenAddress,
    target: CharacterTarget,
  ): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('link a token to a character');
    const rules = new CharacterLinkBo(campaignId);
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedCharactersAndGrid(this.deps.transaction, address, (locked) =>
      this.linkIn(locked, rules, command.tokenId, target),
    );
    return this.published(campaignId, saved);
  }

  private async linkIn(
    { daos, scene }: Locked,
    rules: CharacterLinkBo,
    tokenId: string,
    target: CharacterTarget,
  ): Promise<CharactersAndGridChange<Relinked>> {
    const found = await tokenIn(daos, scene, scene.campaignId, tokenId);
    rules.requireFree(found.token);
    const characterId = (await target(daos)).character.id;
    const placed = await daos.characterLinks.placedOn(scene.id, characterId);
    rules.requireNotPlaced(tokenId, characterId, placed);
    await daos.characterLinks.adopt(tokenId, characterId);
    return relinked(daos, scene, found);
  }

  // The token as read is already composed: its identity is the character's.
  private async unlinkIn(
    { daos, scene }: Locked,
    rules: CharacterLinkBo,
    tokenId: string,
  ): Promise<CharactersAndGridChange<Relinked>> {
    const found = await tokenIn(daos, scene, scene.campaignId, tokenId);
    const characterId = rules.linkedOf(found.token);
    await daos.characterLinks.release(tokenId, characterId, identityOf(found.token));
    return relinked(daos, scene, found);
  }

  private published(campaignId: string, saved: SavedInCharactersAndGrid<Relinked>): number {
    if (!saved.grid) return saved.version;
    const base = savedEventBase(campaignId, saved.grid, this.deps.clock);
    const { token, veiled } = saved.value;
    publishTokenChange(this.deps.publisher, 'token:updated', base, token, veiled);
    return saved.version;
  }
}

// The token as saved, with its conditions, and the veil a change of its control may draw.
async function relinked(
  daos: TokenWriteDaos,
  scene: ScenePo,
  before: TokenRow,
): Promise<CharactersAndGridChange<Relinked>> {
  const after = await tokenIn(daos, scene, scene.campaignId, before.token.id);
  const token = await withConditions(daos, after);
  const veiled = await changeSceneOf(daos, scene, before, after, false);
  return { value: { token, veiled }, grid: true, characters: false };
}
