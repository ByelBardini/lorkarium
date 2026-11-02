import { changeSceneOf, publishTokenChange, type ChangeScene } from './token-veil';
import type {
  LinkTokenToCharacterCommandDto,
  UnlinkTokenFromCharacterCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import {
  inLockedCharactersAndGrid,
  type CharactersAndGridChange,
  type LockedGridMaybeCharacters,
  type SavedInCharactersAndGrid,
} from '../characters/locked-characters-grid';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { gridEventBase } from '../scenes/locked-scene';
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

export type TokenLinkServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: TokenTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

type Locked = LockedGridMaybeCharacters<TokenWriteDaos>;
type Relinked = Readonly<{ token: TokenWithConditions; veiled: ChangeScene }>;

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
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('link a token to a character');
    const rules = new CharacterLinkBo();
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedCharactersAndGrid(this.deps.transaction, address, (locked) =>
      this.linkIn(locked, rules, command),
    );
    return this.published(campaignId, saved);
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
    const rules = new CharacterLinkBo();
    const address = { campaignId, sceneId: command.sceneId, access };
    const saved = await inLockedCharactersAndGrid(this.deps.transaction, address, (locked) =>
      this.unlinkIn(locked, rules, command.tokenId),
    );
    return this.published(campaignId, saved);
  }

  private async linkIn(
    { daos, scene }: Locked,
    rules: CharacterLinkBo,
    { tokenId, characterId }: LinkTokenToCharacter,
  ): Promise<CharactersAndGridChange<Relinked>> {
    const found = await tokenIn(daos, scene, scene.campaignId, tokenId);
    rules.requireFree(found.token);
    await characterIn(daos, scene.campaignId, characterId);
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
    const base = gridEventBase(campaignId, saved.grid, this.deps.clock);
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
