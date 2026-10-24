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

/** Every room a member enters to have one grid open: the grid's, their own and, for a master,
 *  the masters'.
 *
 *  Example: `await socket.join(sceneAudienceRooms(campaignId, sceneId, userId, true))` */
export function sceneAudienceRooms(
  campaignId: string,
  sceneId: string,
  userId: string,
  isMaster: boolean,
): string[] {
  const rooms = [sceneRoom(campaignId, sceneId), sceneUserRoom(campaignId, sceneId, userId)];
  if (isMaster) rooms.push(sceneMastersRoom(campaignId, sceneId));
  return rooms;
}

/** Whether `room` is one of the table's: the table itself or anything named under it.
 *
 *  Example: `[...socket.rooms].filter((room) => isRoomOfCampaign(room, campaignId))` */
export function isRoomOfCampaign(room: string, campaignId: string): boolean {
  const table = campaignRoom(campaignId);
  return room === table || room.startsWith(`${table}:`);
}
