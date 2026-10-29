/** The Socket.IO room of one table; every presence and board event of it goes there.
 *
 *  Example: `io.to(campaignRoom(campaignId)).emit('session:memberLeft', event)` */
export function campaignRoom(campaignId: string): string {
  return `campaign:${campaignId}`;
}

/** One user's room inside a table: events only they (and the master) may see go here (§3.9).
 *
 *  Example: `io.to(campaignUserRoom(campaignId, controllerId)).emit('token:updated', full)` */
export function campaignUserRoom(campaignId: string, userId: string): string {
  return `${campaignRoom(campaignId)}:user:${userId}`;
}

/** One person's chat inside a table, the spectator included (unlike `campaignUserRoom`, which
 *  receives the board): whispers, direct and group messages reach every tab of each of their
 *  people here, and nobody else.
 *
 *  Example: `io.to([campaignChatRoom(campaignId, anaId), campaignChatRoom(campaignId, biaId)])` */
export function campaignChatRoom(campaignId: string, userId: string): string {
  return `${campaignRoom(campaignId)}:chat:${userId}`;
}

/** The masters of a table: they always get the unredacted board.
 *
 *  Example: `io.to(campaignMastersRoom(campaignId)).emit('token:updated', full)` */
export function campaignMastersRoom(campaignId: string): string {
  return `${campaignRoom(campaignId)}:masters`;
}

/** One grid (scene) of a table: its board events go here, to whoever has it open — the group
 *  grid for everyone at the table, an extra tab only for who watched it. Named under the table,
 *  so leaving a table leaves its grids too.
 *
 *  Example: `io.to(sceneRoom(campaignId, sceneId)).emit('scene:updated', event)` */
export function sceneRoom(campaignId: string, sceneId: string): string {
  return `${campaignRoom(campaignId)}:scene:${sceneId}`;
}

/** The masters who have one grid open: they get its unredacted board.
 *
 *  Example: `io.to(sceneMastersRoom(campaignId, sceneId)).emit('token:updated', full)` */
export function sceneMastersRoom(campaignId: string, sceneId: string): string {
  return `${sceneRoom(campaignId, sceneId)}:masters`;
}

/** One user with one grid open: what only they (and the master) may see of it (§3.9).
 *
 *  Example: `io.to(sceneUserRoom(campaignId, sceneId, controllerId)).emit('token:updated', full)` */
export function sceneUserRoom(campaignId: string, sceneId: string, userId: string): string {
  return `${sceneRoom(campaignId, sceneId)}:user:${userId}`;
}

/** Who a connection is at one table, for the rooms it enters: the masters get the unredacted
 *  board, a player what their tokens show, a spectator only what everyone sees. */
export type TableAudience = 'master' | 'player' | 'spectator';

/** Every room a member enters to have one grid open: the grid's; for a player and a master their
 *  own too (the whole token they control is published there); for a master, the masters'. A
 *  spectator stays out of their own room, so a control kept from before a demotion is inert.
 *
 *  Example: `await socket.join(sceneAudienceRooms(campaignId, sceneId, userId, 'master'))` */
export function sceneAudienceRooms(
  campaignId: string,
  sceneId: string,
  userId: string,
  audience: TableAudience,
): string[] {
  const rooms = [sceneRoom(campaignId, sceneId)];
  if (audience === 'spectator') return rooms;
  rooms.push(sceneUserRoom(campaignId, sceneId, userId));
  if (audience === 'master') rooms.push(sceneMastersRoom(campaignId, sceneId));
  return rooms;
}

/** Whether `room` is one of the table's: the table itself or anything named under it.
 *
 *  Example: `[...socket.rooms].filter((room) => isRoomOfCampaign(room, campaignId))` */
export function isRoomOfCampaign(room: string, campaignId: string): boolean {
  const table = campaignRoom(campaignId);
  return room === table || room.startsWith(`${table}:`);
}

/** The grid that `room` is the room of, at that table; `undefined` for any other room (the
 *  table's, an audience's, someone's own room in a grid).
 *
 *  Example: `sceneIdOfRoom(sceneRoom(campaignId, sceneId), campaignId) // sceneId` */
export function sceneIdOfRoom(room: string, campaignId: string): string | undefined {
  const prefix = `${campaignRoom(campaignId)}:scene:`;
  if (!room.startsWith(prefix)) return undefined;
  const sceneId = room.slice(prefix.length);
  return sceneId.includes(':') ? undefined : sceneId;
}
