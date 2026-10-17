import type { DrawingsDao } from '../../src/modules/drawings/drawings.dao';
import type {
  DrawingMovePo,
  DrawingPo,
  NewDrawingPo,
} from '../../src/modules/drawings/drawings.po';
import type { DrawingTransactionRunner } from '../../src/modules/drawings/drawings.service';
import { squarePo } from './drawings-factories';
import type { ScenesDaoFake } from './scenes-fakes';

/** In-memory drawings of every scene, filtered by scene like the real DAO. Writes go to `journal`
 *  ('save'), shared with the scenes fake, so a spec reads the whole order of a command.
 *
 *  Example: `const drawings = new DrawingsDaoFake(scenes.journal, [squarePo()])` */
export class DrawingsDaoFake implements Pick<
  DrawingsDao,
  'insertMany' | 'listOfScene' | 'countOfScene' | 'findManyInScene' | 'moveMany' | 'deleteMany'
> {
  constructor(
    private readonly journal: string[],
    readonly rows: DrawingPo[] = [],
  ) {}

  /** Bulk rows for the scene limit, without touching the journal. */
  fill(count: number, sceneId: string): void {
    for (let index = 0; index < count; index += 1) {
      this.rows.push(squarePo({ id: `filler-${index}`, sceneId, drawOrder: 1000 + index }));
    }
  }

  async insertMany(rows: readonly NewDrawingPo[]): Promise<DrawingPo[]> {
    this.journal.push('save');
    const saved = rows.map((row, index) =>
      squarePo({ ...row, id: `drawing-${this.rows.length + index + 1}`, drawOrder: 100 + index }),
    );
    this.rows.push(...saved);
    return saved;
  }

  async listOfScene(sceneId: string): Promise<DrawingPo[]> {
    return this.rows.filter((row) => row.sceneId === sceneId);
  }

  async countOfScene(sceneId: string): Promise<number> {
    return (await this.listOfScene(sceneId)).length;
  }

  async findManyInScene(sceneId: string, drawingIds: readonly string[]): Promise<DrawingPo[]> {
    return this.rows.filter((row) => row.sceneId === sceneId && drawingIds.includes(row.id));
  }

  // One 'save' for the whole group: it is one write in the transaction.
  async moveMany(sceneId: string, moves: readonly DrawingMovePo[]): Promise<void> {
    this.journal.push('save');
    for (const { drawingId, x, y } of moves) {
      const index = this.rows.findIndex((row) => row.id === drawingId && row.sceneId === sceneId);
      const found = this.rows[index];
      if (found) this.rows[index] = { ...found, x, y };
    }
  }

  async deleteMany(sceneId: string, drawingIds: readonly string[]): Promise<void> {
    this.journal.push('save');
    const kept = this.rows.filter((row) => row.sceneId !== sceneId || !drawingIds.includes(row.id));
    this.rows.splice(0, this.rows.length, ...kept);
  }
}

/** Runs the work on the fakes and writes 'commit' to the shared journal once it resolves. */
export class DrawingTransactionRunnerFake {
  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly drawings: DrawingsDaoFake,
  ) {}

  readonly run: DrawingTransactionRunner = async (work) => {
    const result = await work({ scenes: this.scenes, drawings: this.drawings });
    this.scenes.journal.push('commit');
    return result;
  };
}
