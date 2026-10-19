import type {
  CreateWallsCommandDto,
  DeleteWallsCommandDto,
  EraseWallAreaCommandDto,
  EraseWallSegmentCommandDto,
  MoveWallsCommandDto,
  SetDoorCommandDto,
  SetWallKindsCommandDto,
} from '@lorkarium/contracts';
import { doorSeenBy, type LightSource, type Wall } from '@lorkarium/game-core';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { LightsDao } from '../lights/lights.dao';
import { lightSourceOfRow } from '../lights/lights.mapper';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import {
  inLockedScene,
  type CreatedInScene,
  type LockedScene,
  type SceneLockDaos,
  type SceneTransaction,
} from '../scenes/locked-scene';
import type { ScenePo } from '../scenes/scenes.po';
import type { TokenRow, TokensDao } from '../tokens/tokens.dao';
import { tokenEyeOf, tokenLightOf } from '../tokens/tokens.mapper';
import { DoorAccessBo } from './door-access.bo';
import { WallRulesBo, type WallLimits } from './wall-rules.bo';
import type { WallsDao } from './walls.dao';
import { WallNotFoundError } from './walls.error';
import {
  placedWallOf,
  positionOfWall,
  toNewWallPo,
  toNewWallPoOf,
  toWallDto,
  toWallMovePo,
  wallAt,
  wallHundredth,
  wallOfRow,
  wallOfShape,
  type PlacedWall,
} from './walls.mapper';
import type { WallKindPo, WallPo } from './walls.po';

type Envelope = 'actionId' | 'campaignId';
export type CreateWalls = Omit<CreateWallsCommandDto, Envelope>;
export type MoveWalls = Omit<MoveWallsCommandDto, Envelope>;
export type DeleteWalls = Omit<DeleteWallsCommandDto, Envelope>;
export type SetWallKinds = Omit<SetWallKindsCommandDto, Envelope>;
export type SetDoor = Omit<SetDoorCommandDto, Envelope>;
export type EraseWallSegment = Omit<EraseWallSegmentCommandDto, Envelope>;
export type EraseWallArea = Omit<EraseWallAreaCommandDto, Envelope>;

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type WallWriteDaos = SceneLockDaos &
  Readonly<{
    walls: Pick<
      WallsDao,
      | 'insertMany'
      | 'listOfScene'
      | 'findManyInScene'
      | 'moveMany'
      | 'setKinds'
      | 'setDoor'
      | 'deleteMany'
    >;
    /** The eyes of a player who opens a door (the tokens they control on the scene) and the
     *  lights of every token there. */
    tokens: Pick<TokensDao, 'listOfScene'>;
    /** The map lights that may show a player the door. */
    lights: Pick<LightsDao, 'listOfScene'>;
  }>;

export type WallTransactionRunner = SceneTransaction<WallWriteDaos>;

export type WallsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: WallTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  limits: WallLimits;
}>;

type Locked = LockedScene<WallWriteDaos>;
type EventBase = Readonly<{ campaignId: string; version: number; at: string }>;

/** The wall use cases, master only, each all or nothing in one version: lock the scene, decide,
 *  save, bump and, only after the commit, publish to the whole table.
 *
 *  Example: `const created = await wallsService.createMany(user.id, campaignId, { walls })` */
export class WallsService {
  constructor(private readonly deps: WallsServiceDeps) {}

  async createMany(
    userId: string,
    campaignId: string,
    command: CreateWalls,
  ): Promise<CreatedInScene> {
    await this.requireMaster(userId, campaignId, 'create walls');
    const saved = await inLockedScene(
      this.deps.transaction,
      campaignId,
      async ({ daos, scene }) => {
        const rules = this.rulesFor(scene);
        const adding = command.walls.map((shape) => rules.place(wallOfShape(shape)));
        rules.admit((await daos.walls.listOfScene(scene.id)).map(wallOfRow), adding);
        const rows = command.walls.map((shape) => toNewWallPo(scene.id, shape));
        return (await daos.walls.insertMany(rows)).map(toWallDto);
      },
    );
    this.deps.publisher.wallsCreated({
      ...this.eventBase(campaignId, saved.version),
      walls: saved.value,
    });
    return { version: saved.version, createdIds: saved.value.map(({ id }) => id) };
  }

  async moveMany(userId: string, campaignId: string, command: MoveWalls): Promise<number> {
    await this.requireMaster(userId, campaignId, 'move walls');
    const ids = command.moves.map(({ wallId }) => wallId);
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const rows = await wallsIn(locked, campaignId, ids);
      const rules = this.rulesFor(locked.scene);
      rows.forEach((row, index) => {
        const move = command.moves[index];
        if (!move) return;
        rules.requireAt(row.id, move.expect, positionOfWall(row));
        rules.place(wallAt(wallOfRow(row), move));
      });
      await locked.daos.walls.moveMany(locked.scene.id, command.moves.map(toWallMovePo));
    });
    const moves = command.moves.map(({ wallId, x, y }) => ({
      wallId,
      x: wallHundredth(x),
      y: wallHundredth(y),
    }));
    this.deps.publisher.wallsMoved({ ...this.eventBase(campaignId, saved.version), moves });
    return saved.version;
  }

  async deleteMany(userId: string, campaignId: string, command: DeleteWalls): Promise<number> {
    await this.requireMaster(userId, campaignId, 'delete walls');
    const { wallIds } = command;
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const rules = this.rulesFor(locked.scene);
      for (const row of await wallsIn(locked, campaignId, wallIds)) {
        const expected = command.expect?.find(({ wallId }) => wallId === row.id);
        rules.requireAt(row.id, expected, positionOfWall(row));
      }
      await locked.daos.walls.deleteMany(locked.scene.id, wallIds);
    });
    const event = { ...this.eventBase(campaignId, saved.version), wallIds: [...wallIds] };
    this.deps.publisher.wallsDeleted(event);
    return saved.version;
  }

  async setKindMany(userId: string, campaignId: string, command: SetWallKinds): Promise<number> {
    await this.requireMaster(userId, campaignId, 'change wall kinds');
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const rules = this.rulesFor(locked.scene);
      const rows = await wallsIn(locked, campaignId, command.wallIds);
      const changes: WallKindPo[] = rows.map((row) => {
        const expected = command.expect?.find(({ wallId }) => wallId === row.id);
        rules.requireKind(row.id, expected?.kind, row.kind);
        return { wallId: row.id, ...rules.kindChange(row.id, wallOfRow(row), command.kind) };
      });
      await locked.daos.walls.setKinds(locked.scene.id, changes);
      return changes;
    });
    const changes = saved.value.map((change) => ({ ...change }));
    this.deps.publisher.wallKindsChanged({ ...this.eventBase(campaignId, saved.version), changes });
    return saved.version;
  }

  /** Opens, closes or locks a door, in one version: the master any door, a player an unlocked
   *  door one of their tokens sees — the one sight rule the server works out (game-core).
   *
   *  Example: `await wallsService.setDoor(user.id, campaignId, { wallId, state: 'open' })` */
  async setDoor(userId: string, campaignId: string, command: SetDoor): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const [row] = await wallsIn(locked, campaignId, [command.wallId]);
      if (!row) throw new WallNotFoundError(campaignId, command.wallId);
      const placed = (await locked.daos.walls.listOfScene(locked.scene.id)).map(placedWallOf);
      const door = placed.find(({ id }) => id === row.id) ?? placedWallOf(row);
      const seen = await doorSeen(locked, access, userId, placed, door.wall);
      new DoorAccessBo(access).requireSet(door, command.state, seen);
      await locked.daos.walls.setDoor(locked.scene.id, row.id, command.state);
    });
    const event = { ...this.eventBase(campaignId, saved.version), wallId: command.wallId };
    this.deps.publisher.doorChanged({ ...event, doorState: command.state });
    return saved.version;
  }

  /** Takes one straight piece out of a wall (master), all in one version: the wall goes, what
   *  is left comes back as new walls (their ids answered in order), and the table gets one
   *  `wall:segmentErased`.
   *
   *  Example: `await wallsService.eraseSegment(user.id, campaignId, { wallId, segmentIndex: 0 })` */
  async eraseSegment(
    userId: string,
    campaignId: string,
    command: EraseWallSegment,
  ): Promise<CreatedInScene> {
    await this.requireMaster(userId, campaignId, 'erase a piece of a wall');
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const [row] = await wallsIn(locked, campaignId, [command.wallId]);
      if (!row) throw new WallNotFoundError(campaignId, command.wallId);
      const rules = this.rulesFor(locked.scene);
      rules.requireAt(row.id, command.expect, positionOfWall(row));
      const rest = rules.restAfterErase(row.id, wallOfRow(row), command.segmentIndex);
      const others = await locked.daos.walls.listOfScene(locked.scene.id);
      rules.admit(others.filter(({ id }) => id !== row.id).map(wallOfRow), rest);
      await locked.daos.walls.deleteMany(locked.scene.id, [row.id]);
      const rows = rest.map((piece) => toNewWallPoOf(locked.scene.id, piece));
      return (await locked.daos.walls.insertMany(rows)).map(toWallDto);
    });
    const event = { ...this.eventBase(campaignId, saved.version), wallId: command.wallId };
    this.deps.publisher.wallSegmentErased({ ...event, walls: saved.value });
    return { version: saved.version, createdIds: saved.value.map(({ id }) => id) };
  }

  /** The eraser box (master), all in one version: every wall it covers goes and what is left
   *  outside it comes back as new walls (ids answered in the scene's order), one `wall:areaErased`.
   *
   *  Example: `await wallsService.eraseArea(user.id, campaignId, { box: { x: 3, y: 1, width: 2, height: 2 } })` */
  async eraseArea(
    userId: string,
    campaignId: string,
    command: EraseWallArea,
  ): Promise<CreatedInScene> {
    await this.requireMaster(userId, campaignId, 'erase an area of walls');
    const saved = await inLockedScene(this.deps.transaction, campaignId, async (locked) => {
      const placed = (await locked.daos.walls.listOfScene(locked.scene.id)).map(placedWallOf);
      const rules = this.rulesFor(locked.scene);
      const { wallIds, rest } = rules.eraseArea(placed, command.box);
      const kept = placed.filter(({ id }) => !wallIds.includes(id)).map(({ wall }) => wall);
      rules.admit(kept, rest);
      if (wallIds.length > 0) await locked.daos.walls.deleteMany(locked.scene.id, wallIds);
      const rows = rest.map((piece) => toNewWallPoOf(locked.scene.id, piece));
      const added = rows.length > 0 ? await locked.daos.walls.insertMany(rows) : [];
      return { wallIds, walls: added.map(toWallDto) };
    });
    const { wallIds, walls } = saved.value;
    this.deps.publisher.wallAreaErased({
      ...this.eventBase(campaignId, saved.version),
      wallIds,
      walls,
    });
    return { version: saved.version, createdIds: walls.map(({ id }) => id) };
  }

  private async requireMaster(userId: string, campaignId: string, action: string): Promise<void> {
    (await memberAccessOf(this.deps.members, campaignId, userId)).requireMaster(action);
  }

  private rulesFor(scene: ScenePo): WallRulesBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    return new WallRulesBo({ scene: sceneSize, limits: this.deps.limits });
  }

  private eventBase(campaignId: string, version: number): EventBase {
    return { campaignId, version, at: this.deps.clock.now().toISOString() };
  }
}

// The master never needs to see the door; a player looks through every token they control, and
// sees what any lit map light or token of the scene shows them (the same rule as the client's).
async function doorSeen(
  locked: Locked,
  access: CampaignAccessBo,
  userId: string,
  placed: readonly PlacedWall[],
  door: Wall,
): Promise<boolean> {
  if (access.isMaster()) return true;
  const rows = await locked.daos.tokens.listOfScene(locked.scene.id);
  const eyes = rows.filter(({ controllerIds }) => controllerIds.includes(userId)).map(tokenEyeOf);
  const lights = await lightsOfScene(locked, rows);
  const walls = placed.map(({ wall }) => wall);
  return doorSeenBy({ eyes, walls, mode: locked.scene.visionMode, lights }, door);
}

async function lightsOfScene(
  { daos, scene }: Locked,
  rows: readonly TokenRow[],
): Promise<LightSource[]> {
  const mapLights = (await daos.lights.listOfScene(scene.id)).map(lightSourceOfRow);
  return [...mapLights, ...rows.map(tokenLightOf)].filter((light) => light !== null);
}

// Every id must be on the scene: the first one missing (another table's too) refuses them all.
async function wallsIn(
  { daos, scene }: Locked,
  campaignId: string,
  wallIds: readonly string[],
): Promise<WallPo[]> {
  const found = await daos.walls.findManyInScene(scene.id, wallIds);
  const byId = new Map(found.map((row) => [row.id, row]));
  return wallIds.map((wallId) => {
    const row = byId.get(wallId);
    if (!row) throw new WallNotFoundError(campaignId, wallId);
    return row;
  });
}
