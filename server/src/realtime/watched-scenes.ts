/** The extra grid tabs of one connection, by campaign id → scene ids. */
export type WatchedScenes = ReadonlyMap<string, ReadonlySet<string>>;

/** The tabs with `sceneId` opened at `campaignId`; the map received is not changed.
 *
 *  Example: `socket.data.watchedSceneIds = withWatchedScene(socket.data.watchedSceneIds, id, torre)` */
export function withWatchedScene(
  watched: WatchedScenes,
  campaignId: string,
  sceneId: string,
): WatchedScenes {
  const scenes = new Set(watched.get(campaignId)).add(sceneId);
  return new Map(watched).set(campaignId, scenes);
}

/** The tabs without `sceneId` at `campaignId` (idempotent); a table left with none drops out.
 *
 *  Example: `socket.data.watchedSceneIds = withoutWatchedScene(socket.data.watchedSceneIds, id, torre)` */
export function withoutWatchedScene(
  watched: WatchedScenes,
  campaignId: string,
  sceneId: string,
): WatchedScenes {
  const scenes = new Set(watched.get(campaignId));
  scenes.delete(sceneId);
  if (scenes.size === 0) return withoutWatchedTable(watched, campaignId);
  return new Map(watched).set(campaignId, scenes);
}

/** The tabs without any grid of `campaignId`: the table was left.
 *
 *  Example: `socket.data.watchedSceneIds = withoutWatchedTable(socket.data.watchedSceneIds, id)` */
export function withoutWatchedTable(watched: WatchedScenes, campaignId: string): WatchedScenes {
  const rest = new Map(watched);
  rest.delete(campaignId);
  return rest;
}
