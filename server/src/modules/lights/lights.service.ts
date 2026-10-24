import type {
  CreateLightsCommandDto,
  DeleteLightsCommandDto,
  MoveLightsCommandDto,
  SetLightColorsCommandDto,
  SetLightConesCommandDto,
  SetLightRangesCommandDto,
  SetLightsLitCommandDto,
} from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import type { CampaignAccessBo } from '../campaigns/campaign-access.bo';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import {
  gridEventBase,
  inLockedGrid,
  type CreatedInScene,
  type GridAddress,
  type LockedGrid,
  type SavedInScene,
  type GridLockDaos,
  type SceneTransaction,
} from '../scenes/locked-scene';
import type { ScenePo } from '../scenes/scenes.po';
import { LightRulesBo } from './light-rules.bo';
import type { LightsDao } from './lights.dao';
import { LightNotFoundError } from './lights.error';
import {
  colorOfLight,
  coneOfLight,
  lightMovedTo,
  positionOfLight,
  rangeOfLight,
  savedColorOf,
  savedConeOf,
  savedMoveOf,
  savedRangeOf,
  sceneLightOf,
  sceneLightOfPlacement,
  toLightColorPo,
  toLightConePo,
  toLightDto,
  toLightMovePo,
  toLightRangePo,
  toNewLightPo,
} from './lights.mapper';
import type { LightPo } from './lights.po';

type Envelope = 'actionId' | 'campaignId';
export type CreateLights = Omit<CreateLightsCommandDto, Envelope>;
export type MoveLights = Omit<MoveLightsCommandDto, Envelope>;
export type SetLightRanges = Omit<SetLightRangesCommandDto, Envelope>;
export type SetLightColors = Omit<SetLightColorsCommandDto, Envelope>;
export type SetLightCones = Omit<SetLightConesCommandDto, Envelope>;
export type SetLightsLit = Omit<SetLightsLitCommandDto, Envelope>;
export type DeleteLights = Omit<DeleteLightsCommandDto, Envelope>;

/** The DAOs a transaction hands out, bound to the open `tx`. */
export type LightWriteDaos = GridLockDaos &
  Readonly<{
    lights: Pick<
      LightsDao,
      | 'insertMany'
      | 'listOfScene'
      | 'findManyInScene'
      | 'moveMany'
      | 'setRanges'
      | 'setColors'
      | 'setCones'
      | 'setLit'
      | 'deleteMany'
    >;
  }>;

export type LightTransactionRunner = SceneTransaction<LightWriteDaos>;

export type LightsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: LightTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
  /** `LIGHTS_PER_SCENE_MAX`, passed in by the plugin. */
  limit: number;
}>;

type Locked = LockedGrid<LightWriteDaos>;

/** The map light use cases, master only, on the grid the command names, each all or nothing in
 *  one version: lock that grid, decide, save, bump and, only after the commit, publish to who has
 *  it open.
 *
 *  Example: `const created = await lightsService.createMany(user.id, campaignId, { lights })` */
export class LightsService {
  constructor(private readonly deps: LightsServiceDeps) {}

  async createMany(
    userId: string,
    campaignId: string,
    command: CreateLights,
  ): Promise<CreatedInScene> {
    const access = await this.requireMaster(userId, campaignId, 'create lights');
    const saved = await inLockedGrid(
      this.deps.transaction,
      { campaignId, sceneId: command.sceneId, access },
      async (locked) => {
        const rules = this.rulesFor(locked.scene);
        for (const placement of command.lights) rules.place(sceneLightOfPlacement(placement));
        const stored = await locked.daos.lights.listOfScene(locked.scene.id);
        rules.admit(stored.length, command.lights.length);
        const rows = command.lights.map((placement) => toNewLightPo(locked.scene.id, placement));
        return (await locked.daos.lights.insertMany(rows)).map(toLightDto);
      },
    );
    const event = { ...gridEventBase(campaignId, saved, this.deps.clock), lights: saved.value };
    this.deps.publisher.lightsCreated(event);
    return { version: saved.version, createdIds: saved.value.map(({ id }) => id) };
  }

  async moveMany(userId: string, campaignId: string, command: MoveLights): Promise<number> {
    const access = await this.requireMaster(userId, campaignId, 'move lights');
    const { moves } = command;
    const saved = await this.changeEach(
      { campaignId, sceneId: command.sceneId, access },
      moves,
      (rules, row, move) => {
        rules.requireAt(row.id, move.expect, positionOfLight(row));
        rules.place(lightMovedTo(sceneLightOf(row), move));
      },
      (lights, sceneId) => lights.moveMany(sceneId, moves.map(toLightMovePo)),
    );
    this.deps.publisher.lightsMoved({
      ...gridEventBase(campaignId, saved, this.deps.clock),
      moves: moves.map(savedMoveOf),
    });
    return saved.version;
  }

  async setRangeMany(userId: string, campaignId: string, command: SetLightRanges): Promise<number> {
    const access = await this.requireMaster(userId, campaignId, 'change the range of lights');
    const { changes } = command;
    const saved = await this.changeEach(
      { campaignId, sceneId: command.sceneId, access },
      changes,
      (rules, row, change) => rules.requireRange(row.id, change.expect, rangeOfLight(row)),
      (lights, sceneId) => lights.setRanges(sceneId, changes.map(toLightRangePo)),
    );
    this.deps.publisher.lightRangesChanged({
      ...gridEventBase(campaignId, saved, this.deps.clock),
      changes: changes.map(savedRangeOf),
    });
    return saved.version;
  }

  async setColorMany(userId: string, campaignId: string, command: SetLightColors): Promise<number> {
    const access = await this.requireMaster(userId, campaignId, 'change the color of lights');
    const { changes } = command;
    const saved = await this.changeEach(
      { campaignId, sceneId: command.sceneId, access },
      changes,
      (rules, row, change) => rules.requireColor(row.id, change.expect, colorOfLight(row)),
      (lights, sceneId) => lights.setColors(sceneId, changes.map(toLightColorPo)),
    );
    this.deps.publisher.lightColorsChanged({
      ...gridEventBase(campaignId, saved, this.deps.clock),
      changes: changes.map(savedColorOf),
    });
    return saved.version;
  }

  /** Aims map lights and opens or narrows their cone (master), all or nothing in one version;
   *  `expect` is the cone the undo finds. */
  async setConeMany(userId: string, campaignId: string, command: SetLightCones): Promise<number> {
    const access = await this.requireMaster(userId, campaignId, 'aim lights');
    const { changes } = command;
    const saved = await this.changeEach(
      { campaignId, sceneId: command.sceneId, access },
      changes,
      (rules, row, change) => rules.requireCone(row.id, change.expect, coneOfLight(row)),
      (lights, sceneId) => lights.setCones(sceneId, changes.map(toLightConePo)),
    );
    this.deps.publisher.lightConesChanged({
      ...gridEventBase(campaignId, saved, this.deps.clock),
      changes: changes.map(savedConeOf),
    });
    return saved.version;
  }

  /** Lights or puts out map lights (master): a game action, like a door, so no undo precondition. */
  async setLitMany(userId: string, campaignId: string, command: SetLightsLit): Promise<number> {
    const access = await this.requireMaster(userId, campaignId, 'light or put out lights');
    const { lightIds, lit } = command;
    const saved = await inLockedGrid(
      this.deps.transaction,
      { campaignId, sceneId: command.sceneId, access },
      async (locked) => {
        await lightsIn(locked, campaignId, lightIds);
        await locked.daos.lights.setLit(locked.scene.id, lightIds, lit);
      },
    );
    const event = {
      ...gridEventBase(campaignId, saved, this.deps.clock),
      lightIds: [...lightIds],
      lit,
    };
    this.deps.publisher.lightsLitChanged(event);
    return saved.version;
  }

  async deleteMany(userId: string, campaignId: string, command: DeleteLights): Promise<number> {
    const access = await this.requireMaster(userId, campaignId, 'delete lights');
    const { lightIds } = command;
    const saved = await inLockedGrid(
      this.deps.transaction,
      { campaignId, sceneId: command.sceneId, access },
      async (locked) => {
        const rules = this.rulesFor(locked.scene);
        for (const row of await lightsIn(locked, campaignId, lightIds)) {
          const expected = command.expect?.find(({ lightId }) => lightId === row.id);
          rules.requireAt(row.id, expected, positionOfLight(row));
        }
        await locked.daos.lights.deleteMany(locked.scene.id, lightIds);
      },
    );
    const event = { ...gridEventBase(campaignId, saved, this.deps.clock), lightIds: [...lightIds] };
    this.deps.publisher.lightsDeleted(event);
    return saved.version;
  }

  /** Locks the addressed grid, finds every light changed (all or none), checks each against its
   *  change and writes the group; answers what it saved. */
  private async changeEach<Change extends Readonly<{ lightId: string }>>(
    address: GridAddress,
    changes: readonly Change[],
    check: (rules: LightRulesBo, row: LightPo, change: Change) => void,
    write: (lights: LightWriteDaos['lights'], sceneId: string) => Promise<void>,
  ): Promise<SavedInScene<void>> {
    const { campaignId } = address;
    return inLockedGrid(this.deps.transaction, address, async (locked) => {
      const ids = changes.map(({ lightId }) => lightId);
      const rows = await lightsIn(locked, campaignId, ids);
      const rules = this.rulesFor(locked.scene);
      rows.forEach((row, index) => {
        const change = changes[index];
        if (change) check(rules, row, change);
      });
      await write(locked.daos.lights, locked.scene.id);
    });
  }

  private async requireMaster(
    userId: string,
    campaignId: string,
    action: string,
  ): Promise<CampaignAccessBo> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    access.requireMaster(action);
    return access;
  }

  private rulesFor(scene: ScenePo): LightRulesBo {
    const sceneSize = { widthCells: scene.widthCells, heightCells: scene.heightCells };
    return new LightRulesBo({ scene: sceneSize, limit: this.deps.limit });
  }
}

// Every id must be on the scene: the first one missing (another table's too) refuses them all.
async function lightsIn(
  { daos, scene }: Locked,
  campaignId: string,
  lightIds: readonly string[],
): Promise<LightPo[]> {
  const found = await daos.lights.findManyInScene(scene.id, lightIds);
  const byId = new Map(found.map((row) => [row.id, row]));
  return lightIds.map((lightId) => {
    const row = byId.get(lightId);
    if (!row) throw new LightNotFoundError(campaignId, lightId);
    return row;
  });
}
