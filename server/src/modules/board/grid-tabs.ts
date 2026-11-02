import type {
  BoardSyncAckDto,
  SceneUnwatchAckDto,
  WatchSceneCommandDto,
} from '@lorkarium/contracts';
import type { RealtimeSocket } from '../../realtime/realtime-server';
import { sceneAudienceRooms } from '../../realtime/rooms';
import { withWatchedScene, withoutWatchedScene } from '../../realtime/watched-scenes';
import type { SceneWatchService } from '../scenes/scene-watch.service';
import type { BoardService } from './board.service';

/** What the extra grid tabs of a connection need: the access check and the snapshot. */
export type GridTabsDeps = Readonly<{
  board: Pick<BoardService, 'snapshotFor'>;
  sceneWatch: Pick<SceneWatchService, 'watch' | 'groupSceneIdOf'>;
}>;

type SyncOk = Extract<BoardSyncAckDto, { ok: true }>;

/** `scene:watch`: enters the grid's rooms under the share lock, remembers the tab and answers the
 *  snapshot of that grid.
 *
 *  Example: `socket.on('scene:watch', bind(watchSceneCommandDto, (userId, c) => watchGrid(deps, socket, userId, c)))` */
export async function watchGrid(
  deps: GridTabsDeps,
  socket: RealtimeSocket,
  userId: string,
  command: WatchSceneCommandDto,
): Promise<SyncOk> {
  const { campaignId, sceneId } = command;
  await deps.sceneWatch.watch(userId, campaignId, sceneId, (role) =>
    socket.join(sceneAudienceRooms(campaignId, sceneId, userId, role)),
  );
  socket.data.watchedSceneIds = withWatchedScene(socket.data.watchedSceneIds, campaignId, sceneId);
  // In the rooms before the snapshot is read: an event committed in between arrives too, and the
  // client keeps whichever of the two is newer by the version.
  try {
    return { ok: true, state: await deps.board.snapshotFor(userId, campaignId, sceneId) };
  } catch (error) {
    // The grid went out of reach between the watch and the snapshot: a refused tab keeps no room.
    await unwatchGrid(deps, socket, userId, command);
    throw error;
  }
}

/** `scene:unwatch`: forgets the tab and leaves the grid's rooms, unless it is the group grid
 *  (not a tab: everyone at the table has it open) or was never a tab.
 *
 *  Example: `await unwatchGrid(deps, socket, userId, { actionId, campaignId, sceneId: torreId })` */
export async function unwatchGrid(
  deps: GridTabsDeps,
  socket: RealtimeSocket,
  userId: string,
  { campaignId, sceneId }: WatchSceneCommandDto,
): Promise<Extract<SceneUnwatchAckDto, { ok: true }>> {
  const { watchedSceneIds } = socket.data;
  if (!watchedSceneIds.get(campaignId)?.has(sceneId)) return { ok: true };
  socket.data.watchedSceneIds = withoutWatchedScene(watchedSceneIds, campaignId, sceneId);
  if ((await deps.sceneWatch.groupSceneIdOf(campaignId)) === sceneId) return { ok: true };
  for (const room of sceneAudienceRooms(campaignId, sceneId, userId, 'master')) {
    void socket.leave(room);
  }
  return { ok: true };
}
