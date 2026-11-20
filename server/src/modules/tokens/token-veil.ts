import type { CombatDto } from '@lorkarium/contracts';
import type {
  BoardPublisherPort,
  SeersChange,
  TokenChange,
  VeiledLightsChange,
} from '../scenes/board-publisher.port';
import type { GridEventBase } from '../scenes/locked-scene';
import { deletedSeenBy, deletedTokenSeenBy } from '../combat/combat-veil.mapper';
import { changeVeilOf, seersCutsOf, veiledLightsCutsOf } from './token-hidden.mapper';
import {
  NO_CHANGE_VEIL,
  cutsOf,
  invisibleTo,
  joinedVeil,
  sceneVeilOf,
  seenVeil,
  veilOf,
  veiledLightsOf,
  veiledTokenOf,
  type TokenVeil,
} from './token-veil.mapper';
import type { TokenRow, TokensDao } from './tokens.dao';
import type { ScenePo } from '../scenes/scenes.po';
import {
  audiencesOf,
  combatOf,
  tokenConditionsOf,
  type TokenWithConditions,
  type TokenWriteDaos,
} from './token-transaction';

type SeerReads = Readonly<{ tokens: Pick<TokensDao, 'magicSeersOfScene'> }>;
type VeilReads = Readonly<{ tokens: Pick<TokensDao, 'veilOfScene' | 'magicSeersOfScene'> }>;

/** The veil with the seers of the grid (who controls a token with magic sight), read once
 *  (`magicSeersOfScene`) only when it is not empty: a write of visible tokens reads nothing more.
 *
 *  Example: `const veil = await withSeersOf(daos, scene.id, veilOf(rows))` */
export async function withSeersOf(
  daos: SeerReads,
  sceneId: string,
  veil: TokenVeil,
): Promise<TokenVeil> {
  if (veil.tokens.length === 0) return veil;
  return seenVeil(veil, await daos.tokens.magicSeersOfScene(sceneId));
}

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
  const veil = await withSeersOf(daos, sceneId, veilOf(touched));
  const shining = touched.filter(({ token }) => token.hidden && token.lightBright !== null);
  if (shining.length === 0) return { veil, lights: null };
  const after = seenVeil(sceneVeilOf(await daos.tokens.veilOfScene(sceneId)), veil.seerIds ?? []);
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
  if (!combat?.combatants.some(({ tokenIds }) => tokenIds.length > 0))
    return withSeersOf(daos, sceneId, veil);
  const scene = joinedVeil(veil, sceneVeilOf(await daos.tokens.veilOfScene(sceneId)));
  return withSeersOf(daos, sceneId, scene);
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
  if (!after.token.hidden) return { ...unseen, lights };
  const seerIds = await daos.tokens.magicSeersOfScene(scene.id);
  if (!lost) return { ...unseen, veil: seenVeil(NO_HIDDEN, seerIds), lights };
  const veil = seenVeil(sceneVeilOf(await daos.tokens.veilOfScene(scene.id)), seerIds);
  return { ...unseen, veil, combat: await combatOf(daos, scene), lights };
}

/** The seers of the grid before a write that may change them (a token with magic sight created,
 *  edited, linked or deleted); `null`, and no read, when it cannot.
 *
 *  Example: `const seers = await seersBeforeOf(daos, scene.id, command.magicSight != null)` */
export async function seersBeforeOf(
  daos: SeerReads,
  sceneId: string,
  mayChange: boolean,
): Promise<readonly string[] | null> {
  return mayChange ? daos.tokens.magicSeersOfScene(sceneId) : null;
}

/** When the seers changed and the grid has a hidden token, the change in a version of its own,
 *  bumped here, before the one of the command: who started seeing gets the hidden tokens, who
 *  stopped loses them, everyone else `board:advanced`. Run it in the transaction, after the
 *  write; `null` (no read) without `before`.
 *
 *  Example: `const seers = await seersShiftOf(daos, scene, before, now)` */
export async function seersShiftOf(
  daos: TokenWriteDaos,
  scene: ScenePo,
  before: readonly string[] | null,
  at: string,
): Promise<PublishedSeers | null> {
  if (before === null) return null;
  const after = await daos.tokens.magicSeersOfScene(scene.id);
  const gained = after.filter((userId) => !before.includes(userId));
  const lost = before.filter((userId) => !after.includes(userId));
  if (gained.length + lost.length === 0) return null;
  const rows = (await daos.tokens.listOfScene(scene.id)).filter(({ token }) => token.hidden);
  if (rows.length === 0) return null;
  const conditionsOf = await tokenConditionsOf(daos.conditions, rows);
  const hidden = rows.map((row) => audiencesOf({ row, conditions: conditionsOf(row) }));
  const veil = seenVeil(veilOf(rows), after);
  const version = await daos.scenes.bumpVersion(scene.id);
  const base = { campaignId: scene.campaignId, sceneId: scene.id, version, at };
  const cuts = seersCutsOf(base, {
    gained,
    lost,
    hidden,
    veil,
    combat: await combatOf(daos, scene),
  });
  const lights = [...gained, ...lost].map((userId) => ({
    audience: { kind: 'seer', userId } as const,
    lights: veiledLightsOf(veil, invisibleTo(veil, userId)),
  }));
  return { change: { ...base, cuts }, lights };
}

/** A change of the seers, ready to publish: the event and the new veiled lights of who changed. */
export type PublishedSeers = Readonly<{
  change: SeersChange;
  lights: VeiledLightsChange['cuts'];
}>;

/** Publishes the change of the seers, if any, before the command's own event (its version comes
 *  first); after the commit, like every event.
 *
 *  Example: `publishSeers(publisher, saved.value.seers)` */
export function publishSeers(
  publisher: Pick<BoardPublisherPort, 'seersChanged' | 'veiledLightsChanged'>,
  seers: PublishedSeers | null,
): void {
  if (!seers) return;
  publisher.seersChanged(seers.change);
  const { campaignId, sceneId, at } = seers.change;
  publishVeiledLights(publisher, { campaignId, sceneId, at }, seers.lights);
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

/** What a deletion of one token saved, to publish under the veil. */
export type TokenDeletion = Readonly<{
  combat: CombatDto | null;
  veil: TokenVeil;
  lights: VeiledLightsChange['cuts'] | null;
  hidden: boolean;
  seers: PublishedSeers | null;
}>;

/** Publishes a deletion: first the change of the seers, then a hidden token as
 *  `token:deletedMany` (whoever did not see it gets the combat at most) or a visible one as
 *  `token:deleted`, and the veiled lights it changed.
 *
 *  Example: `publishTokenDeletion(publisher, base, command.tokenId, saved.value)` */
export function publishTokenDeletion(
  publisher: BoardPublisherPort,
  base: GridEventBase,
  tokenId: string,
  deletion: TokenDeletion,
): void {
  publishSeers(publisher, deletion.seers);
  const at = { ...base, combat: deletion.combat };
  if (deletion.hidden) {
    const event = { ...at, tokenIds: [tokenId] };
    publisher.tokensDeleted(event, cutsOf(event, deletion.veil, deletedSeenBy));
  } else {
    const event = { ...at, tokenId };
    publisher.tokenDeleted(event, cutsOf(event, deletion.veil, deletedTokenSeenBy));
  }
  const { campaignId, sceneId } = base;
  publishVeiledLights(publisher, { campaignId, sceneId, at: base.at }, deletion.lights);
}
