import type { WallsDao } from './walls.dao';
import { sceneWallsOf, type SceneWalls } from './walls.mapper';

/** Scenes whose walls are kept before the memory starts over. */
export const SCENE_WALLS_MEMORY_MAX = 256;

/** The walls of each scene, remembered between commands so a player's move or door does not
 *  read every wall again; the same `walls` array comes back while nothing changed, so the
 *  game-core preparation of it (`preparedWalls`) is reused too.
 *
 *  Only a command **holding the scene lock** may fill it (read through the `tx` DAO): a reader
 *  outside the lock could store walls a writer is about to change. Whoever writes walls calls
 *  `forget` inside the transaction, right after the write, and again after it ends. One server
 *  instance only (spec §5.7).
 *
 *  Example: `const { placed, walls } = await sceneWalls.wallsOf(scene.id, daos.walls)` */
export class SceneWallsService {
  private readonly known = new Map<string, SceneWalls>();

  constructor(private readonly limit: number = SCENE_WALLS_MEMORY_MAX) {}

  async wallsOf(sceneId: string, walls: Pick<WallsDao, 'listOfScene'>): Promise<SceneWalls> {
    const kept = this.known.get(sceneId);
    if (kept) return kept;
    const fresh = sceneWallsOf(await walls.listOfScene(sceneId));
    if (this.known.size >= this.limit) this.known.clear();
    this.known.set(sceneId, fresh);
    return fresh;
  }

  forget(sceneId: string): void {
    this.known.delete(sceneId);
  }
}
