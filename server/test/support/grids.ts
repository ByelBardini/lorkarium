import {
  boardSyncAckDto,
  librarySceneDto,
  sceneActivateAckDto,
  type BoardSyncAckDto,
  type SceneActivateAckDto,
  type SceneVisibilityDto,
} from '@lorkarium/contracts';
import { envelope } from './live-table';
import type { RealtimeClient } from './realtime-client';
import type { SignedInUser } from './sign-in';
import type { Table } from './tables';
import type { TokenTableHarness } from './token-table';

type Emit = (event: string, payload: object) => Promise<unknown>;

/** A grid created in `table`'s library by its master, through the real HTTP edge; it is born
 *  private.
 *
 *  Example: `const torre = await newGrid(live, live.ana, live.vharn, 'Torre')` */
export async function newGrid(
  live: TokenTableHarness,
  master: SignedInUser,
  table: Table,
  name: string,
): Promise<string> {
  const url = `/api/campaigns/${table.id}/scenes`;
  const response = await live.http(master, { method: 'POST', url, payload: { name } });
  if (response.statusCode !== 201) throw new Error(`create of ${name} answered ${response.body}`);
  return librarySceneDto.parse(response.json()).id;
}

/** Makes `sceneId` public or private through the real HTTP edge.
 *
 *  Example: `await setGridVisibility(live, live.ana, live.vharn, torre, 'public')` */
export async function setGridVisibility(
  live: TokenTableHarness,
  master: SignedInUser,
  table: Table,
  sceneId: string,
  visibility: SceneVisibilityDto,
): Promise<void> {
  const url = `/api/campaigns/${table.id}/scenes/${sceneId}`;
  const response = await live.http(master, { method: 'PATCH', url, payload: { visibility } });
  if (response.statusCode !== 200) throw new Error(`patch of ${sceneId} answered ${response.body}`);
}

/** Sends `event` (`board:sync`, `scene:watch`) for one grid and parses the snapshot ack.
 *
 *  Example: `const ack = await gridAck(bia, 'board:sync', live.vharn, torre)` */
export async function gridAck(
  client: RealtimeClient,
  event: string,
  table: Table,
  sceneId: string,
): Promise<BoardSyncAckDto> {
  const timed = client.timeout(2000);
  const emit = timed.emitWithAck as Emit;
  const payload = { ...envelope(table.id), sceneId };
  return boardSyncAckDto.parse(await emit.call(timed, event, payload));
}

/** `client` takes the group of `table` to `sceneId` (`scene:activate`) and parses the ack.
 *
 *  Example: `expect(await activateGrid(ana, live.vharn, estrada)).toEqual({ ok: true })` */
export async function activateGrid(
  client: RealtimeClient,
  table: Table,
  sceneId: string,
): Promise<SceneActivateAckDto> {
  const timed = client.timeout(2000);
  const emit = timed.emitWithAck as Emit;
  const payload = { ...envelope(table.id), sceneId };
  return sceneActivateAckDto.parse(await emit.call(timed, 'scene:activate', payload));
}
