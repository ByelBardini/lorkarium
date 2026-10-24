import { SceneWallsService } from '../../src/modules/walls/scene-walls.service';
import type { WallsDao } from '../../src/modules/walls/walls.dao';
import type { NewWallPo, WallKindPo, WallMovePo, WallPo } from '../../src/modules/walls/walls.po';
import type { WallTransactionRunner } from '../../src/modules/walls/walls.service';
import { LightsDaoFake } from './lights-fakes';
import type { ScenesDaoFake } from './scenes-fakes';
import { TokensDaoFake } from './tokens-fakes';
import { northWallPo } from './walls-factories';

/** In-memory walls of every scene, filtered by scene like the real DAO. Writes go to `journal`
 *  ('save'), shared with the scenes fake, so a spec reads the whole order of a command.
 *
 *  Example: `const walls = new WallsDaoFake(scenes.journal, [northWallPo()])` */
export class WallsDaoFake implements Pick<
  WallsDao,
  | 'insertMany'
  | 'listOfScene'
  | 'findManyInScene'
  | 'moveMany'
  | 'setKinds'
  | 'setDoor'
  | 'deleteMany'
> {
  constructor(
    private readonly journal: string[],
    readonly rows: WallPo[] = [],
  ) {}

  /** Bulk straight walls for the scene limit, without touching the journal. */
  fill(count: number, sceneId: string): void {
    for (let index = 0; index < count; index += 1) {
      this.rows.push(northWallPo({ id: `filler-${index}`, sceneId, wallOrder: 1000 + index }));
    }
  }

  async insertMany(rows: readonly NewWallPo[]): Promise<WallPo[]> {
    this.journal.push('save');
    const saved = rows.map((row, index) =>
      northWallPo({
        points: null,
        doorState: null,
        ...row,
        id: `wall-${this.rows.length + index + 1}`,
        wallOrder: 100 + index,
      }),
    );
    this.rows.push(...saved);
    return saved;
  }

  async listOfScene(sceneId: string): Promise<WallPo[]> {
    return this.rows.filter((row) => row.sceneId === sceneId);
  }

  async findManyInScene(sceneId: string, wallIds: readonly string[]): Promise<WallPo[]> {
    return this.rows.filter((row) => row.sceneId === sceneId && wallIds.includes(row.id));
  }

  // One 'save' for the whole group: it is one write in the transaction.
  async moveMany(sceneId: string, moves: readonly WallMovePo[]): Promise<void> {
    this.journal.push('save');
    for (const { wallId, x, y } of moves) this.patch(sceneId, wallId, { x, y });
  }

  async setKinds(sceneId: string, kinds: readonly WallKindPo[]): Promise<void> {
    this.journal.push('save');
    for (const { wallId, kind, doorState } of kinds)
      this.patch(sceneId, wallId, { kind, doorState });
  }

  async setDoor(sceneId: string, wallId: string, state: NonNullable<WallPo['doorState']>) {
    this.journal.push('save');
    this.patch(sceneId, wallId, { doorState: state });
  }

  async deleteMany(sceneId: string, wallIds: readonly string[]): Promise<void> {
    this.journal.push('save');
    const kept = this.rows.filter((row) => row.sceneId !== sceneId || !wallIds.includes(row.id));
    this.rows.splice(0, this.rows.length, ...kept);
  }

  private patch(sceneId: string, wallId: string, change: Partial<WallPo>): void {
    const index = this.rows.findIndex((row) => row.id === wallId && row.sceneId === sceneId);
    const found = this.rows[index];
    if (found) this.rows[index] = { ...found, ...change };
  }
}

/** Runs the work on the fakes and writes 'commit' to the shared journal once it resolves. */
export class WallTransactionRunnerFake {
  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly walls: WallsDaoFake,
    private readonly tokens: Pick<TokensDaoFake, 'listOfScene'> = new TokensDaoFake([]),
    private readonly lights: Pick<LightsDaoFake, 'listOfScene'> = new LightsDaoFake([]),
  ) {}

  readonly run: WallTransactionRunner = async (work) => {
    const { scenes, walls, tokens, lights } = this;
    const result = await work({ scenes, walls, tokens, lights });
    this.scenes.journal.push('commit');
    return result;
  };
}

/** The walls of each scene as `listOfScene` reads them; `listed` keeps every scene asked.
 *
 *  Example: `const dao = new WallListingsFake([northWallPo()]); dao.listed // ['scene-1']` */
export class WallListingsFake implements Pick<WallsDao, 'listOfScene'> {
  readonly listed: string[] = [];

  constructor(readonly rows: WallPo[] = []) {}

  async listOfScene(sceneId: string): Promise<WallPo[]> {
    this.listed.push(sceneId);
    return this.rows.filter((row) => row.sceneId === sceneId);
  }
}

/** The real memory of scene walls that also writes 'forget' to a journal when given one, so a
 *  spec reads where in the command the walls were forgotten.
 *
 *  Example: `new SceneWallsFake(scenes.journal)` */
export class SceneWallsFake extends SceneWallsService {
  readonly forgotten: string[] = [];

  constructor(private readonly journal: string[] | null = null) {
    super();
  }

  override forget(sceneId: string): void {
    this.forgotten.push(sceneId);
    this.journal?.push('forget');
    super.forget(sceneId);
  }
}
