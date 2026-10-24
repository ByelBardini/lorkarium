import type {
  AdjustBarCommandDto,
  CreateTokenCommandDto,
  DeleteTokenCommandDto,
  DragTokensCommandDto,
  MoveTokenCommandDto,
  MoveTokensCommandDto,
  SetTokenLayerCommandDto,
  UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import {
  inLockedGrid,
  reachedGridOf,
  type LockedGrid,
  type SavedInScene,
} from '../scenes/locked-scene';
import type { ScenePo } from '../scenes/scenes.po';
import {
  inLockedGridWithCast,
  type CastAndGridChange,
  type LockedGridMaybeCast,
  type SavedInCastAndGrid,
  type SavedVersion,
} from '../scenes/locked-cast';
import { splitUpdate } from './linked-token';
import { TokenRulesBo } from './token-rules.bo';
import {
  audiencesOf,
  combatOf,
  holderRowOf,
  newTokenRowOf,
  leaveCombat,
  requireAssetsOf,
  tokenAccessOf,
  tokenIn,
  tokensIn,
  withConditions,
  type TokenTransactionRunner,
  type TokenWithConditions,
  type TokenWriteDaos,
} from './token-transaction';
import { TokenAccessBo } from './token-access.bo';
import type { DragGroupPo, TokenRow, TokenUpdatePo, TokensDao } from './tokens.dao';
import { BarNotFoundError, TokenNotFoundError } from './tokens.error';
import { toTokenUpdatePo } from './tokens.mapper';
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
type GroupCell = Readonly<{ tokenId: string; cell: Readonly<{ col: number; row: number }> | null }>;
type CellAt = Readonly<{ col: number; row: number }>;
/** One token's way across the scene: from where it stands, by its bends, to `to`. */
type TokenPassage = Readonly<{ row: TokenRow; path: readonly CellAt[] | undefined; to: CellAt }>;

export type TokensServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership' | 'listMembers'>;
  transaction: TokenTransactionRunner;
  /** The drag preview reads here, on the pool and outside any transaction. */
  dragGroups: Pick<TokensDao, 'findDragGroup'>;
  /** The walls of each scene, remembered; filled only under the scene lock. */
  sceneWalls: Pick<SceneWallsService, 'wallsOf'>;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** `BAR_VALUE_LIMIT`, handed to the rule. */
  barLimit: number;
  /** `TOKENS_PER_SCENE_MAX`, handed to the rule. */
  tokenLimit: number;
}>;

type Locked = LockedGrid<TokenWriteDaos>;

/** The token use cases, on the grid the command names (absent = the group grid): each locks
 *  that grid, decides, saves, bumps the version and, only after
 *  the commit, publishes (whole to the privileged, redacted to the rest). Returns the version.
 *
 *  Example: `const version = await tokensService.move(user.id, campaignId, { tokenId, col, row })` */
export class TokensService {
  constructor(private readonly deps: TokensServiceDeps) {}

  async create(userId: string, campaignId: string, command: CreateToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('create a token');
    const memberIds = await this.memberIdsOf(campaignId);
    const saved = await this.inGrid(access, command.sceneId, async ({ daos, scene }) => {
      const rules = this.rulesFor(scene, memberIds);
      const row = newTokenRowOf(scene.id, rules, command);
      rules.admit(await daos.tokens.countOfScene(scene.id), 1);
      await requireAssetsOf(daos, campaignId, [command.imageAssetId]);
      // A token just created carries no condition: nothing to read back for it.
      return { row: await daos.tokens.insert(row), conditions: [] };
    });
    this.publishChange('token:created', campaignId, saved);
    return saved.version;
  }

  /** On a linked token, the name, initials, side, look, bars and controllers go to its anchor
   *  (an event of the cast) and the rest stays on the token (an event of the grid). */
  async update(userId: string, campaignId: string, command: UpdateToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('edit a token');
    const memberIds = await this.memberIdsOf(campaignId);
    const saved = await this.inSharedGrid(access, command.sceneId, async (locked) => {
      const { daos, scene } = locked;
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      const rules = this.rulesFor(scene, memberIds);
      rules.place(found.token, command);
      const update = toTokenUpdatePo(command, rules.controllers(command.controllerIds));
      const holder = await holderRowOf(locked, found);
      await requireAssetsOf(daos, campaignId, [command.imageAssetId]);
      if (holder.inCast) await this.updateLinked(daos, found, holder.row, update);
      else await daos.tokens.update(found.token.id, update);
      await daos.mainTokens.dropLostControl(found.token.id, update.controllerIds);
      const anchor = holder.inCast ? await this.reread(daos, holder.scene, holder.row) : null;
      const token = await this.reread(daos, scene, found);
      return { value: { token, anchor }, grid: true, cast: holder.inCast };
    });
    if (saved.cast && saved.value.anchor)
      this.publishSaved('token:updated', campaignId, saved.value.anchor, saved.cast);
    if (saved.grid) this.publishSaved('token:updated', campaignId, saved.value.token, saved.grid);
    return saved.version;
  }

  async move(userId: string, campaignId: string, command: MoveToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const saved = await this.inGrid(access, command.sceneId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      tokenAccessOf(access, found).requireMove('move', found.token.layer);
      const { col, row } = this.rulesFor(scene, []).place(command, found.token);
      const passage = { row: found, path: command.path, to: command };
      await this.requirePassages({ daos, scene }, access, [passage]);
      await daos.tokens.move(found.token.id, col, row);
      return { col, row };
    });
    const { col, row } = saved.value;
    const at = this.now();
    this.deps.publisher.tokenMoved({
      campaignId,
      sceneId: saved.sceneId,
      version: saved.version,
      at,
      tokenId: command.tokenId,
      col,
      row,
    });
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
      const rows = await this.placeGroup(locked, access, cells, 'move');
      const rules = this.rulesFor(locked.scene, []);
      rows.forEach((row, index) => {
        rules.requireAt(row.token.id, command.moves[index]?.expect, row.token);
      });
      const passages = rows.flatMap((row, index) => {
        const move = command.moves[index];
        return move ? [{ row, path: move.path, to: move }] : [];
      });
      await this.requirePassages(locked, access, passages);
      await locked.daos.tokens.moveMany(locked.scene.id, moves);
    });
    const at = this.now();
    const { version, sceneId } = saved;
    this.deps.publisher.tokensMoved({ campaignId, sceneId, version, at, moves });
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
    this.placeDrags(access, scene, group?.tokens ?? [], command.drags);
    const drags = command.drags.map(({ tokenId, cell }) => ({ tokenId, cell }));
    const event = { campaignId, sceneId: scene.id, at: this.now(), drags };
    this.deps.publisher.tokensDragged(event, connectionId);
    return scene.version;
  }

  /** Moves 1 to 64 tokens of the active scene to one layer, all or nothing, in one version.
   *
   *  Example: `await tokensService.setLayer(user.id, campaignId, { tokenIds, layer: 'objects' })` */
  async setLayer(userId: string, campaignId: string, command: SetTokenLayer): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('change the layer of tokens');
    const saved = await this.inGrid(access, command.sceneId, async ({ daos, scene }) => {
      await tokensIn(daos, scene, campaignId, command.tokenIds);
      await daos.tokens.setLayer(command.tokenIds, command.layer);
    });
    const { tokenIds, layer } = command;
    const at = this.now();
    this.deps.publisher.tokenLayerChanged({
      campaignId,
      sceneId: saved.sceneId,
      version: saved.version,
      at,
      tokenIds: [...tokenIds],
      layer,
    });
    return saved.version;
  }

  /** The bar of a linked token is its anchor's: the anchor changes, in the cast's version. */
  async adjustBar(userId: string, campaignId: string, command: AdjustBar): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const saved = await this.inSharedGrid(access, command.sceneId, async (locked) => {
      const { daos, scene } = locked;
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      tokenAccessOf(access, found).requireControl('adjust a bar of');
      const bar = found.bars.find(({ id }) => id === command.barId);
      if (!bar) throw new BarNotFoundError(command.tokenId, command.barId);
      const values = this.rulesFor(scene, []).adjustBar(bar, command.change);
      const holder = await holderRowOf(locked, found);
      await daos.tokens.setBarValues(bar.id, values);
      const changed = await this.reread(daos, holder.scene, holder.row);
      return { value: changed, grid: !holder.inCast, cast: holder.inCast };
    });
    const touched = saved.cast ?? saved.grid;
    if (touched) this.publishSaved('token:updated', campaignId, saved.value, touched);
    return saved.version;
  }

  async delete(userId: string, campaignId: string, command: DeleteToken): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster('delete a token');
    const saved = await this.inGrid(access, command.sceneId, async ({ daos, scene }) => {
      const found = await tokenIn(daos, scene, campaignId, command.tokenId);
      await leaveCombat(daos, scene, access, [found.token.id]);
      await daos.tokens.delete(found.token.id);
      return combatOf(daos, scene);
    });
    const at = this.now();
    this.deps.publisher.tokenDeleted({
      campaignId,
      sceneId: saved.sceneId,
      version: saved.version,
      at,
      tokenId: command.tokenId,
      combat: saved.value,
    });
    return saved.version;
  }

  private async memberIdsOf(campaignId: string): Promise<string[]> {
    return (await this.deps.members.listMembers(campaignId)).map(({ userId }) => userId);
  }

  // A linked token's anchor and its grid token: each written with what is its own.
  private async updateLinked(
    daos: TokenWriteDaos,
    found: TokenRow,
    anchor: TokenRow,
    update: TokenUpdatePo,
  ): Promise<void> {
    const split = splitUpdate(update, anchor.token);
    await daos.tokens.update(anchor.token.id, split.anchor);
    await daos.tokens.updateFields(found.token.id, split.own);
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
    work: (locked: LockedGridMaybeCast<TokenWriteDaos>) => Promise<CastAndGridChange<T>>,
  ): Promise<SavedInCastAndGrid<T>> {
    const address = { campaignId: access.campaignIdOf(), sceneId, access };
    return inLockedGridWithCast(this.deps.transaction, address, work);
  }

  private inGrid<T>(
    access: CampaignAccessBo,
    sceneId: string | undefined,
    work: (locked: Locked) => Promise<T>,
  ): Promise<SavedInScene<T>> {
    const address = { campaignId: access.campaignIdOf(), sceneId, access };
    return inLockedGrid(this.deps.transaction, address, work);
  }

  // Every token found, movable by the requester and fitting where it goes, before any write.
  private async placeGroup(
    { daos, scene }: Locked,
    access: CampaignAccessBo,
    cells: readonly GroupCell[],
    action: 'move' | 'drag',
  ): Promise<TokenRow[]> {
    const tokenIds = cells.map(({ tokenId }) => tokenId);
    const rows = await tokensIn(daos, scene, access.campaignIdOf(), tokenIds);
    const rules = this.rulesFor(scene, []);
    rows.forEach((row, index) => {
      tokenAccessOf(access, row).requireMove(action, row.token.layer);
      const cell = cells[index]?.cell;
      if (cell) rules.place(cell, row.token);
    });
    return rows;
  }

  // The same checks as `placeGroup`, over what the drag query found.
  private placeDrags(
    access: CampaignAccessBo,
    scene: DragGroupPo['scene'],
    dragged: DragGroupPo['tokens'],
    drags: readonly GroupCell[],
  ): void {
    const byId = new Map(dragged.map((each) => [each.token.id, each]));
    const rules = this.rulesFor(scene, []);
    for (const { tokenId, cell } of drags) {
      const found = byId.get(tokenId);
      if (!found) throw new TokenNotFoundError(access.campaignIdOf(), tokenId);
      const { controllerIds } = found;
      new TokenAccessBo(access, { tokenId, controllerIds }).requireMove('drag', found.token.layer);
      if (cell) rules.place(cell, found.token);
    }
  }

  // The master passes every wall; a player's token walks its path center to center (spec §5.4).
  private async requirePassages(
    { daos, scene }: Locked,
    access: CampaignAccessBo,
    passages: readonly TokenPassage[],
  ): Promise<void> {
    const walking = passages.filter(({ row }) => !tokenAccessOf(access, row).ignoresWalls());
    if (walking.length === 0) return;
    const walls = await this.deps.sceneWalls.wallsOf(scene.id, daos.walls);
    const rules = this.rulesFor(scene, []);
    for (const { row, path, to } of walking) {
      rules.requirePassage(row.token.id, [row.token, ...(path ?? []), to], row.token, walls);
    }
  }

  private rulesFor(
    scene: Pick<ScenePo, 'widthCells' | 'heightCells'>,
    memberIds: readonly string[],
  ): TokenRulesBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    const { barLimit, tokenLimit } = this.deps;
    return new TokenRulesBo({ scene: sceneSize, memberIds, barLimit, tokenLimit });
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
  ): void {
    const { sceneId } = saved;
    const base = { campaignId, sceneId, version: saved.version, at: this.now() };
    const { controllerIds, privileged, others } = audiencesOf(token);
    this.deps.publisher.tokenChanged({
      name,
      campaignId,
      sceneId,
      controllerIds,
      privileged: { ...base, token: privileged },
      others: { ...base, token: others },
    });
  }

  private now(): string {
    return this.deps.clock.now().toISOString();
  }
}
