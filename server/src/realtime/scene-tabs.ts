import type { SceneClosedDto, TableServerEvents } from '@lorkarium/contracts';
import type { RemoteSocket } from 'socket.io';
import type { RealtimeSocketData } from './realtime-server';
import { sceneAudienceRooms } from './rooms';
import { withoutWatchedScene } from './watched-scenes';

/** A connection at a table, as an adapter fetches it from a room. */
export type TableSocket = RemoteSocket<TableServerEvents, RealtimeSocketData>;

/** Closes one grid tab of the connection: out of every room of that grid, the tab forgotten, and
 *  `scene:closed` sent to it with the reason. Used when the grid stops being in reach (made
 *  private, the group moved away, the master demoted).
 *
 *  Example: `closeTab(socket, { campaignId, sceneId, reason: 'private', at })` */
export function closeTab(socket: TableSocket, closed: SceneClosedDto): void {
  const { campaignId, sceneId, reason, at } = closed;
  leaveGrid(socket, campaignId, sceneId);
  const { watchedSceneIds } = socket.data;
  socket.data.watchedSceneIds = withoutWatchedScene(watchedSceneIds, campaignId, sceneId);
  socket.emit('scene:closed', { campaignId, sceneId, reason, at });
}

/** Takes the connection out of every room of one grid, whatever its role there.
 *
 *  Example: `leaveGrid(socket, campaignId, previousSceneId)` */
export function leaveGrid(socket: TableSocket, campaignId: string, sceneId: string): void {
  for (const room of sceneAudienceRooms(campaignId, sceneId, socket.data.user.id, 'master')) {
    void socket.leave(room);
  }
}

/** Whether the connection has `sceneId` open as an extra tab at that table.
 *
 *  Example: `if (hasTab(socket, campaignId, sceneId)) closeTab(socket, closed)` */
export function hasTab(socket: TableSocket, campaignId: string, sceneId: string): boolean {
  return socket.data.watchedSceneIds.get(campaignId)?.has(sceneId) ?? false;
}
