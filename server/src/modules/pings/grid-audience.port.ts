/** Who hears a grid: a connection is in a grid's room only if the server put it there
 *  (`session:join`, `scene:watch`) and took it out when its access changed. Adapter in
 *  `server/src/infrastructure/grid-audience/`. */
export interface GridAudiencePort {
  /** Whether the connection is in the room of the grid, so it sees it and is heard there. */
  reaches(connectionId: string, campaignId: string, sceneId: string): boolean;
}
