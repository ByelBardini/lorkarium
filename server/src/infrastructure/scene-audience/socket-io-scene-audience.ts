import type { SceneClosedDto, TableServerEvents } from '@lorkarium/contracts';
import type { RemoteSocket } from 'socket.io';
import type {
  GridEviction,
  SceneAudiencePort,
  TableMove,
} from '../../modules/scenes/scene-audience.port';
import type { RealtimeServer, RealtimeSocketData } from '../../realtime/realtime-server';
import {
  campaignMastersRoom,
  campaignRoom,
  sceneAudienceRooms,
  sceneRoom,
} from '../../realtime/rooms';
import { withoutWatchedScene } from '../../realtime/watched-scenes';

type TableSocket = RemoteSocket<TableServerEvents, RealtimeSocketData>;

/** Moves the sockets between the rooms of each grid (`server/src/realtime/rooms.ts`); every
 *  socket of a table is in its table room since its `session:join`.
 *
 *  Example: `await new SocketIoSceneAudience(realtime.io).moveTable(move)` */
export class SocketIoSceneAudience implements SceneAudiencePort {
  constructor(private readonly io: RealtimeServer) {}

  async moveTable(move: TableMove): Promise<void> {
    const sockets = await this.io.in(campaignRoom(move.campaignId)).fetchSockets();
    for (const socket of sockets) moveSocket(socket, move);
  }

  async evict(eviction: GridEviction): Promise<void> {
    const { campaignId, sceneId } = eviction;
    const sockets = await this.io.in(sceneRoom(campaignId, sceneId)).fetchSockets();
    for (const socket of sockets) {
      if (eviction.audience === 'players' && isMasterAt(socket, campaignId)) continue;
      closeTab(socket, eviction);
    }
  }
}

// Into the new group grid first: its rooms carry the sheet and the condition list too, so the
// socket is never in no group grid at all.
function moveSocket(socket: TableSocket, { campaignId, sceneId, previous, at }: TableMove): void {
  const isMaster = isMasterAt(socket, campaignId);
  void socket.join(sceneAudienceRooms(campaignId, sceneId, socket.data.user.id, isMaster));
  if (!previous) return;
  const hasTab = socket.data.watchedSceneIds.get(campaignId)?.has(previous.sceneId) ?? false;
  if (hasTab && (isMaster || previous.playersKeepTabs)) return;
  if (!hasTab) return leaveGrid(socket, campaignId, previous.sceneId);
  closeTab(socket, { campaignId, sceneId: previous.sceneId, reason: 'private', at });
}

function closeTab(socket: TableSocket, closed: SceneClosedDto): void {
  const { campaignId, sceneId, reason, at } = closed;
  leaveGrid(socket, campaignId, sceneId);
  const { watchedSceneIds } = socket.data;
  socket.data.watchedSceneIds = withoutWatchedScene(watchedSceneIds, campaignId, sceneId);
  socket.emit('scene:closed', { campaignId, sceneId, reason, at });
}

function leaveGrid(socket: TableSocket, campaignId: string, sceneId: string): void {
  for (const room of sceneAudienceRooms(campaignId, sceneId, socket.data.user.id, true)) {
    void socket.leave(room);
  }
}

function isMasterAt(socket: TableSocket, campaignId: string): boolean {
  return socket.rooms.has(campaignMastersRoom(campaignId));
}
