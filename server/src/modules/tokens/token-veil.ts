import type { CombatDto } from '@lorkarium/contracts';
import type {
  BoardPublisherPort,
  TokenChange,
  VeiledLightsChange,
} from '../scenes/board-publisher.port';
import type { GridEventBase } from '../scenes/locked-scene';
import { changeVeilOf, veiledLightsCutsOf } from './token-hidden.mapper';
import {
  NO_CHANGE_VEIL,
  joinedVeil,
  sceneVeilOf,
  veilOf,
  veiledTokenOf,
  type TokenVeil,
} from './token-veil.mapper';
import type { TokenRow, TokensDao } from './tokens.dao';
import type { ScenePo } from '../scenes/scenes.po';
import {
  audiencesOf,
  combatOf,
  type TokenWithConditions,
  type TokenWriteDaos,
} from './token-transaction';

type VeilReads = Readonly<{ tokens: Pick<TokensDao, 'veilOfScene'> }>;

/** The veil of a write and, when a hidden token it touched gives off light, the new veiled lights
 *  of each audience (`null` = no list changed). */
export type VeiledWrite = Readonly<{ veil: TokenVeil; lights: VeiledLightsChange['cuts'] | null }>;

/** After the write, in its transaction: the veil of the touched rows, read once more
 *  (`veilOfScene`) only when one of the hidden ones has a light (lit or not: it may have just been
 *  lit or put out). A write of visible tokens reads nothing.
 *
 *  Example: `const veiled = await veiledWriteOf(daos, scene.id, rows)` */
export async function veiledWriteOf(
  daos: VeilReads,
  sceneId: string,
  touched: readonly TokenRow[],
): Promise<VeiledWrite> {
  const veil = veilOf(touched);
  const shining = touched.filter(({ token }) => token.hidden && token.lightBright !== null);
  if (shining.length === 0) return { veil, lights: null };
  const after = sceneVeilOf(await daos.tokens.veilOfScene(sceneId));
  return { veil, lights: veiledLightsCutsOf(after, shining.map(veiledTokenOf)) };
}

/** The veil of an event that carries the combat: besides the touched rows, every hidden token of
 *  the scene, since any of them may be in an entry (one more query, only with a combat that has
 *  tokens).
 *
 *  Example: `const veil = await combatVeilOf(daos, scene.id, rows, combat)` */
export async function combatVeilOf(
  daos: VeilReads,
  sceneId: string,
  touched: readonly TokenRow[],
  combat: CombatDto | null,
): Promise<TokenVeil> {
  const veil = veilOf(touched);
  if (!combat?.combatants.some(({ tokenIds }) => tokenIds.length > 0)) return veil;
  return joinedVeil(veil, sceneVeilOf(await daos.tokens.veilOfScene(sceneId)));
}

/** Sends the new veiled lights, if a list changed; after the commit, like every event.
 *
 *  Example: `publishVeiledLights(publisher, { campaignId, sceneId, at }, saved.value.lights)` */
export function publishVeiledLights(
  publisher: Pick<BoardPublisherPort, 'veiledLightsChanged'>,
  address: Readonly<{ campaignId: string; sceneId: string; at: string }>,
  lights: VeiledLightsChange['cuts'] | null,
): void {
  if (!lights || lights.length === 0) return;
  publisher.veiledLightsChanged({ ...address, cuts: lights });
}

/** What a change of one token needs to be published under the veil: whether it is hidden, who
 *  controlled it before and, when someone lost it, the scene's veil and combat (2 more reads,
 *  only then); and the new veiled lights when `lightsTouched` and it shines.
 *
 *  Example: `const scene = await changeSceneOf(daos, grid, found, changed.row, true)` */
export type ChangeScene = Readonly<{
  hidden: boolean;
  formerControllerIds: readonly string[];
  veil: TokenVeil;
  combat: CombatDto | null;
  lights: VeiledLightsChange['cuts'] | null;
}>;

/** See `ChangeScene`; run it in the transaction, after the write.
 *
 *  Example: `const scene = await changeSceneOf(daos, grid, found, changed.row, true)` */
export async function changeSceneOf(
  daos: TokenWriteDaos,
  scene: ScenePo,
  before: TokenRow,
  after: TokenRow,
  lightsTouched: boolean,
): Promise<ChangeScene> {
  const touched = lightsTouched ? [before, after] : [];
  const { lights } = await veiledWriteOf(daos, scene.id, touched);
  const formerControllerIds = before.controllerIds;
  const unseen = { hidden: after.token.hidden, formerControllerIds, veil: NO_HIDDEN, combat: null };
  const lost = formerControllerIds.some((userId) => !after.controllerIds.includes(userId));
  if (!after.token.hidden || !lost) return { ...unseen, lights };
  const veil = sceneVeilOf(await daos.tokens.veilOfScene(scene.id));
  return { ...unseen, veil, combat: await combatOf(daos, scene), lights };
}

const NO_HIDDEN: TokenVeil = { tokens: [] };

/** Publishes `token:created` / `token:updated` of one token in its two versions and, when it is
 *  hidden (`veiled`), under its veil, plus the veiled lights it changed.
 *
 *  Example: `publishTokenChange(publisher, 'token:updated', base, token, veiled)` */
export function publishTokenChange(
  publisher: Pick<BoardPublisherPort, 'tokenChanged' | 'veiledLightsChanged'>,
  name: TokenChange['name'],
  base: GridEventBase,
  token: TokenWithConditions,
  veiled: ChangeScene | null,
): void {
  const { campaignId, sceneId } = base;
  const { controllerIds, privileged, others } = audiencesOf(token);
  const change = {
    ...{ name, campaignId, sceneId, controllerIds },
    ...{ privileged: { ...base, token: privileged }, others: { ...base, token: others } },
  };
  const veil = veiled
    ? changeVeilOf(change, veiled.hidden, veiled.formerControllerIds, veiled)
    : NO_CHANGE_VEIL;
  publisher.tokenChanged(change, veil);
  publishVeiledLights(publisher, { campaignId, sceneId, at: base.at }, veiled?.lights ?? null);
}
