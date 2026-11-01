import {
  controlVeilOf,
  cutsOf,
  entriesSeenBy,
  tokenIdsSeenBy,
  tokenSeenBy,
  veilOf,
} from './token-veil.mapper';
import {
  changeSceneOf,
  combatVeilOf,
  publishTokenChange,
  publishVeiledLights,
  veiledWriteOf,
  type ChangeScene,
} from './token-veil';
import { deletedSeenBy, deletedTokenSeenBy } from '../combat/combat-veil.mapper';
import type {
  AdjustBarCommandDto,
  CreateTokenCommandDto,
  DeleteTokenCommandDto,
  DragTokensCommandDto,
  MoveTokenCommandDto,
  MoveTokensCommandDto,
  TokensDraggedDto,
  TokensMovedDto,
  SetTokenLayerCommandDto,
  UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort, GridEvent } from '../scenes/board-publisher.port';
import {
  inLockedGrid,
  reachedGridOf,
  type LockedGrid,
  type SavedInScene,
} from '../scenes/locked-scene';
import type { ScenePo } from '../scenes/scenes.po';
import type { SavedVersion } from '../scenes/locked-cast';
import type { CharacterRow } from '../characters/characters.dao';
import {
  inLockedGridWithCharacters,
  type CharactersAndGridChange,
  type LockedGridMaybeCharacters,
  type SavedInCharactersAndGrid,
} from '../characters/locked-characters-grid';
import type { CharacterPublisherPort } from '../characters/character-publisher.port';
import { characterIn, linkedCharacterIn } from './linked-token';
import { publishCharactersChange, updateLinkedToken } from './character-writes';
import {
  controlOfDragged,
  movedRowsOf,
  placedGroupOf,
  requireDrags,
  requirePassages,
  tokenRulesOf,
} from './token-group-moves';
import { activeFormAfterEdit, type ShownForm } from './token-forms.bo';
import {
  authorshipOf,
  combatOf,
  newTokenRowOf,
  leaveCombat,
  requireAssetsOf,
  tokenAccessOf,
  tokenIn,
  tokensIn,
  withConditions,
  type TokenRightsReader,
  type TokenTransactionRunner,
  type TokenWithConditions,
  type TokenWriteDaos,
} from './token-transaction';
import { lookAssetIdsOf } from './token-aura.mapper';
import type { TokenRow, TokenUpdatePo, TokensDao } from './tokens.dao';
import type { BarValuesPo } from './tokens.po';
import { BarNotFoundError } from './tokens.error';
import { toAuthoredToken, toEditedToken, toTokenUpdatePo } from './tokens.mapper';
import type { SceneWallsService } from '../walls/scene-walls.service';

type Envelope = 'actionId' | 'campaignId';
export type CreateToken = Omit<CreateTokenCommandDto, Envelope>;
export type UpdateToken = Omit<UpdateTokenCommandDto, Envelope>;
export type MoveToken = Omit<MoveTokenCommandDto, Envelope>;
export type AdjustBar = Omit<AdjustBarCommandDto, Envelope>;
export type DeleteToken = Omit<DeleteTokenCommandDto, Envelope>;
export type SetTokenLayer = Omit<SetTokenLayerCommandDto, Envelope>;
export type MoveTokens = Omit<MoveTokensCommandDto, Envelope>;
export type DragTokens = Omit<DragTokensCommandDto, Envelope>;
export type TokensServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership' | 'listMembers'>;
  transaction: TokenTransactionRunner;
  /** The drag preview reads here, on the pool and outside any transaction. */
  dragGroups: Pick<TokensDao, 'findDragGroup'>;
  /** The walls of each scene, remembered; filled only under the scene lock. */
  sceneWalls: Pick<SceneWallsService, 'wallsOf'>;
  publisher: BoardPublisherPort;
  /** Where a write on a linked token's character is told (`character:changed`). */
  characterPublisher: CharacterPublisherPort;
  clock: ClockPort;
  /** `BAR_VALUE_LIMIT`, handed to the rule. */
  barLimit: number;
  /** `TOKENS_PER_SCENE_MAX`, handed to the rule. */
  tokenLimit: number;
  /** The table settings a player's create, edit and delete read (the master's never do). */
  tokenRights: TokenRightsReader;
}>;

type Locked = LockedGrid<TokenWriteDaos>;
type SharedLocked = LockedGridMaybeCharacters<TokenWriteDaos>;
type Updated = Readonly<{
  token: TokenWithConditions;
  shared: CharacterRow | null;
  veiled: ChangeScene;
}>;
type AdjustedBar = Readonly<{
  changed: TokenWithConditions | null;
  shared: CharacterRow | null;
  veiled: ChangeScene | null;
}>;

/** The token use cases, on the grid the command names (absent = the group grid): each locks
 *  that grid, decides, saves, bumps the version and, only after
 *  the commit, publishes (whole to the privileged, redacted to the rest). Returns the version.
 *
 *  Example: `const version = await tokensService.move(user.id, campaignId, { tokenId, col, row })` */
export class TokensService {
  constructor(private readonly deps: TokensServiceDeps) {}

  async create(userId: string, campaignId: string, command: CreateToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const authorship = await authorshipOf(this.deps.tokenRights, access);
    authorship.requireCreate(command);
    const controllerIds = authorship.newControllersOf(command.controllerIds);
    const memberIds = await this.memberIdsOf(campaignId);
    const saved = await this.inGrid(access, command.sceneId, async ({ daos, scene }) => {
      const rules = tokenRulesOf(scene, memberIds, this.deps);
      const row = newTokenRowOf(scene.id, rules, { ...command, controllerIds }, userId);
      rules.admit(await daos.tokens.countOfScene(scene.id), 1);
      await requireAssetsOf(daos, campaignId, lookAssetIdsOf(command));
      // A token just created carries no condition: nothing to read back for it.
      return { row: await daos.tokens.insert(row), conditions: [] };
    });
    this.publishChange('token:created', campaignId, saved);
    return saved.version;
  }

  /** On a linked token, the name, initials, side, look, aura, bars and controllers go to its
   *  character (a `character:changed`) and the rest, forms included, stays on the token (an event
   *  of the grid). A new image or size, or dropping the shown form, leaves the token without it. */
  async update(userId: string, campaignId: string, command: UpdateToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const authorship = await authorshipOf(this.deps.tokenRights, access);
    const memberIds = await this.memberIdsOf(campaignId);
    const saved = await this.inSharedGrid(access, command.sceneId, async (locked) => {
      const found = await tokenIn(locked.daos, locked.scene, campaignId, command.tokenId);
      authorship.requireEdit(toEditedToken(found), command);
      const rules = tokenRulesOf(locked.scene, memberIds, this.deps);
      rules.place(found.token, command);
      const update = toTokenUpdatePo(command, rules.controllers(command.controllerIds));
      return this.updateIn(locked, found, withShownForm(found.token, update), command);
    });
    const { token, shared, veiled } = saved.value;
    publishCharactersChange(
      this.characterOutlet(),
      campaignId,
      saved.characters,
      shared ? [shared] : [],
    );
    if (saved.grid) this.publishSaved('token:updated', campaignId, token, saved.grid, veiled);
    return saved.version;
  }

  async move(userId: string, campaignId: string, command: MoveToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const saved = await this.inGrid(access, command.sceneId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      tokenAccessOf(access, found).requireMove('move', found.token.layer);
      const { col, row } = tokenRulesOf(scene, [], this.deps).place(command, found.token);
      const passage = { row: found, path: command.path, to: command };
      await requirePassages({ daos, scene }, access, [passage], this.passageDeps());
      await daos.tokens.move(found.token.id, col, row);
      const moved = { ...found, token: { ...found.token, col, row } };
      return { col, row, veiled: await veiledWriteOf(daos, scene.id, [moved]) };
    });
    const { col, row, veiled } = saved.value;
    const { sceneId, version } = saved;
    const at = this.now();
    const event = { campaignId, sceneId, version, at, tokenId: command.tokenId, col, row };
    this.deps.publisher.tokenMoved(event, cutsOf(event, veiled.veil, tokenSeenBy));
    publishVeiledLights(this.deps.publisher, { campaignId, sceneId, at }, veiled.lights);
    return saved.version;
  }

  /** Moves 1 to 64 tokens at once, all or nothing, in one version; each must be movable by
   *  the requester (control and layer), fit the scene and, when the move carries `expect`
   *  (an undo), still be on that cell — else STALE_UNDO.
   *
   *  Example: `await tokensService.moveMany(user.id, campaignId, { moves: [{ tokenId, col, row }] })` */
  async moveMany(userId: string, campaignId: string, command: MoveTokens): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const cells = command.moves.map(({ tokenId, col, row }) => ({ tokenId, cell: { col, row } }));
    const moves = command.moves.map(({ tokenId, col, row }) => ({ tokenId, col, row }));
    const saved = await this.inGrid(access, command.sceneId, async (locked) => {
      const rows = await placedGroupOf(locked, access, cells, 'move', this.deps);
      const rules = tokenRulesOf(locked.scene, [], this.deps);
      rows.forEach((row, index) => {
        rules.requireAt(row.token.id, command.moves[index]?.expect, row.token);
      });
      const passages = rows.flatMap((row, index) => {
        const move = command.moves[index];
        return move ? [{ row, path: move.path, to: move }] : [];
      });
      await requirePassages(locked, access, passages, this.passageDeps());
      await locked.daos.tokens.moveMany(locked.scene.id, moves);
      return veiledWriteOf(locked.daos, locked.scene.id, movedRowsOf(rows, moves));
    });
    const at = this.now();
    const { version, sceneId } = saved;
    const event = { campaignId, sceneId, version, at, moves };
    this.deps.publisher.tokensMoved(event, cutsOf(event, saved.value.veil, MOVES_SEEN_BY));
    publishVeiledLights(this.deps.publisher, { campaignId, sceneId, at }, saved.value.lights);
    return saved.version;
  }

  /** The drag preview of a group, checked like `moveMany` but neither saved nor versioned, and
   *  published to the table except the dragger's connection. One query, no transaction: it
   *  writes nothing, so it neither waits for the scene lock nor holds a connection.
   *
   *  Example: `await tokensService.dragMany(user.id, campaignId, { drags }, socket.id)` */
  async dragMany(
    userId: string,
    campaignId: string,
    command: DragTokens,
    connectionId: string,
  ): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const { sceneId } = command;
    const tokenIds = command.drags.map(({ tokenId }) => tokenId);
    const group = await this.deps.dragGroups.findDragGroup(campaignId, sceneId, tokenIds);
    const scene = reachedGridOf({ campaignId, sceneId, access }, group?.scene);
    requireDrags(access, scene, group?.tokens ?? [], command.drags, this.deps);
    const drags = command.drags.map(({ tokenId, cell }) => ({ tokenId, cell }));
    const event = { campaignId, sceneId: scene.id, at: this.now(), drags };
    const veil = controlVeilOf((group?.tokens ?? []).map(controlOfDragged));
    this.deps.publisher.tokensDragged(event, connectionId, cutsOf(event, veil, DRAGS_SEEN_BY));
    return scene.version;
  }

  /** Moves 1 to 64 tokens of the active scene to one layer, all or nothing, in one version.
   *
   *  Example: `await tokensService.setLayer(user.id, campaignId, { tokenIds, layer: 'objects' })` */
  async setLayer(userId: string, campaignId: string, command: SetTokenLayer): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('change the layer of tokens');
    const saved = await this.inGrid(access, command.sceneId, async ({ daos, scene }) => {
      const rows = await tokensIn(daos, scene, campaignId, command.tokenIds);
      await daos.tokens.setLayer(command.tokenIds, command.layer);
      return veilOf(rows);
    });
    const { tokenIds, layer } = command;
    const { sceneId, version } = saved;
    const event = { campaignId, sceneId, version, at: this.now(), tokenIds: [...tokenIds], layer };
    this.deps.publisher.tokenLayerChanged(event, cutsOf(event, saved.value, tokenIdsSeenBy));
    return saved.version;
  }

  /** The bar of a linked token is its character's: the character changes, in the characters'
   *  version (a `character:changed`), and the grid does not. */
  async adjustBar(userId: string, campaignId: string, command: AdjustBar): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const saved = await this.inSharedGrid(access, command.sceneId, (locked) =>
      this.adjustIn(locked, access, command),
    );
    const { changed, shared, veiled } = saved.value;
    publishCharactersChange(
      this.characterOutlet(),
      campaignId,
      saved.characters,
      shared ? [shared] : [],
    );
    if (saved.grid && changed)
      this.publishSaved('token:updated', campaignId, changed, saved.grid, veiled);
    return saved.version;
  }

  /** A hidden token leaves as `token:deletedMany` (whoever did not see it gets the combat at most). */
  async delete(userId: string, campaignId: string, command: DeleteToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const authorship = await authorshipOf(this.deps.tokenRights, access);
    const saved = await this.inGrid(access, command.sceneId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      authorship.requireDelete([toAuthoredToken(found)]);
      await leaveCombat(daos, scene, access, [found.token.id]);
      await daos.tokens.delete(found.token.id);
      const combat = await combatOf(daos, scene);
      const veil = await combatVeilOf(daos, scene.id, [found], combat);
      const { lights } = await veiledWriteOf(daos, scene.id, [found]);
      return { combat, veil, lights, hidden: found.token.hidden };
    });
    const { sceneId, version } = saved;
    const { combat, veil, lights, hidden } = saved.value;
    const base = { campaignId, sceneId, version, at: this.now(), combat };
    const { tokenId } = command;
    if (hidden) {
      const event = { ...base, tokenIds: [tokenId] };
      this.deps.publisher.tokensDeleted(event, cutsOf(event, veil, deletedSeenBy));
    } else {
      const event = { ...base, tokenId };
      this.deps.publisher.tokenDeleted(event, cutsOf(event, veil, deletedTokenSeenBy));
    }
    publishVeiledLights(this.deps.publisher, { campaignId, sceneId, at: base.at }, lights);
    return saved.version;
  }

  private async memberIdsOf(campaignId: string): Promise<string[]> {
    return (await this.deps.members.listMembers(campaignId)).map(({ userId }) => userId);
  }

  // Each part where it lives; the character first checked (and locked) before any write.
  private async updateIn(
    locked: SharedLocked,
    found: TokenRow,
    update: TokenUpdatePo,
    command: UpdateToken,
  ): Promise<CharactersAndGridChange<Updated>> {
    const { daos, scene } = locked;
    const character = await linkedCharacterIn(locked, found);
    await requireAssetsOf(daos, scene.campaignId, lookAssetIdsOf(command));
    if (character) await updateLinkedToken(daos, found, character, update);
    else await daos.tokens.update(found.token.id, update);
    await daos.mainTokens.dropLostControl(found.token.id, update.controllerIds);
    const shared = character && (await characterIn(daos, scene.campaignId, character.character.id));
    const token = await this.reread(daos, scene, found);
    const veiled = await changeSceneOf(daos, scene, found, token.row, true);
    return { value: { token, shared, veiled }, grid: true, characters: shared !== null };
  }

  // Control and the rule first; then the bar where it lives (the character's, or the token's).
  private async adjustIn(
    locked: SharedLocked,
    access: CampaignAccessBo,
    command: AdjustBar,
  ): Promise<CharactersAndGridChange<AdjustedBar>> {
    const { daos, scene } = locked;
    const found = await tokenIn(daos, scene, scene.campaignId, command.tokenId);
    const values = this.adjustedBar(access, found, scene, command);
    const character = await linkedCharacterIn(locked, found);
    if (character) {
      await daos.characters.setBarValues(command.barId, values);
      const shared = await characterIn(daos, scene.campaignId, character.character.id);
      return { value: { changed: null, shared, veiled: null }, grid: false, characters: true };
    }
    await daos.tokens.setBarValues(command.barId, values);
    const changed = await this.reread(daos, scene, found);
    const veiled = await changeSceneOf(daos, scene, found, changed.row, false);
    return { value: { changed, shared: null, veiled }, grid: true, characters: false };
  }

  private async reread(
    daos: TokenWriteDaos,
    scene: ScenePo,
    row: TokenRow,
  ): Promise<TokenWithConditions> {
    return withConditions(daos, await tokenIn(daos, scene, scene.campaignId, row.token.id));
  }

  private inSharedGrid<T>(
    access: CampaignAccessBo,
    sceneId: string | undefined,
    work: (locked: SharedLocked) => Promise<CharactersAndGridChange<T>>,
  ): Promise<SavedInCharactersAndGrid<T>> {
    const address = { campaignId: access.campaignIdOf(), sceneId, access };
    return inLockedGridWithCharacters(this.deps.transaction, address, work);
  }

  private characterOutlet(): Readonly<{ publisher: CharacterPublisherPort; clock: ClockPort }> {
    return { publisher: this.deps.characterPublisher, clock: this.deps.clock };
  }

  private inGrid<T>(
    access: CampaignAccessBo,
    sceneId: string | undefined,
    work: (locked: Locked) => Promise<T>,
  ): Promise<SavedInScene<T>> {
    const address = { campaignId: access.campaignIdOf(), sceneId, access };
    return inLockedGrid(this.deps.transaction, address, work);
  }

  // Control first, then the bar of the token and the rule of the game-core (`set` over the max
  // is cut there).
  private adjustedBar(
    access: CampaignAccessBo,
    found: TokenRow,
    scene: Pick<ScenePo, 'widthCells' | 'heightCells'>,
    { tokenId, barId, change }: Pick<AdjustBar, 'tokenId' | 'barId' | 'change'>,
  ): BarValuesPo {
    tokenAccessOf(access, found).requireControl('adjust a bar of');
    const bar = found.bars.find(({ id }) => id === barId);
    if (!bar) throw new BarNotFoundError(tokenId, barId);
    return tokenRulesOf(scene, [], this.deps).adjustBar(bar, change);
  }

  private passageDeps(): Parameters<typeof requirePassages>[3] {
    return { walls: this.deps.sceneWalls, limits: this.deps };
  }

  private publishChange(
    name: 'token:created' | 'token:updated',
    campaignId: string,
    saved: SavedInScene<TokenWithConditions>,
  ): void {
    this.publishSaved(name, campaignId, saved.value, saved);
  }

  private publishSaved(
    name: 'token:created' | 'token:updated',
    campaignId: string,
    token: TokenWithConditions,
    saved: SavedVersion,
    veiled: ChangeScene | null = null,
  ): void {
    const base = { campaignId, sceneId: saved.sceneId, version: saved.version, at: this.now() };
    publishTokenChange(this.deps.publisher, name, base, token, veiled);
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}

const MOVES_SEEN_BY = entriesSeenBy<TokensMovedDto>('moves');
const DRAGS_SEEN_BY = entriesSeenBy<GridEvent<TokensDraggedDto>>('drags');

// The update with the form the holder keeps: always written, since replacing the forms drops the
// shown one (FK set null) even when its id stays in the list.
function withShownForm(shown: ShownForm, update: TokenUpdatePo): TokenUpdatePo {
  const formIds = update.forms?.map(({ id }) => id);
  const activeFormId = activeFormAfterEdit(shown, { ...update.fields, formIds });
  return { ...update, fields: { ...update.fields, activeFormId } };
}
