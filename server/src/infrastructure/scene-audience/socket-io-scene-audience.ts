import type {
  GridEviction,
  SceneAudiencePort,
  TableMove,
} from '../../modules/scenes/scene-audience.port';
import type { RealtimeServer } from '../../realtime/realtime-server';
import {
  campaignMastersRoom,
  campaignRoom,
  campaignUserRoom,
  sceneAudienceRooms,
  sceneRoom,
  type TableAudience,
} from '../../realtime/rooms';
import { closeTab, hasTab, leaveGrid, type TableSocket } from '../../realtime/scene-tabs';

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
      if (eviction.audience === 'players' && audienceAt(socket, campaignId) === 'master') continue;
      closeTab(socket, eviction);
    }
  }
}

// Into the new group grid first: its rooms carry the sheet and the condition list too, so the
// socket is never in no group grid at all.
function moveSocket(socket: TableSocket, { campaignId, sceneId, previous, at }: TableMove): void {
  const audience = audienceAt(socket, campaignId);
  void socket.join(sceneAudienceRooms(campaignId, sceneId, socket.data.user.id, audience));
  if (!previous) return;
  const tabOpen = hasTab(socket, campaignId, previous.sceneId);
  if (tabOpen && (audience === 'master' || previous.playersKeepTabs)) return;
  if (!tabOpen) return leaveGrid(socket, campaignId, previous.sceneId);
  closeTab(socket, { campaignId, sceneId: previous.sceneId, reason: 'private', at });
}

// The rooms the join gave the socket say its role, with no database read.
function audienceAt(socket: TableSocket, campaignId: string): TableAudience {
  if (socket.rooms.has(campaignMastersRoom(campaignId))) return 'master';
  if (socket.rooms.has(campaignUserRoom(campaignId, socket.data.user.id))) return 'player';
  return 'spectator';
}
