import type { VeiledLightDto } from '@lorkarium/contracts';
import { tokenCenter } from '@lorkarium/game-core';
import type { TokenChangeVeil, VeilAudience, VeilCuts } from '../scenes/board-publisher.port';
import type { HiddenTokenPo, TokenRow } from './tokens.dao';

/** A hidden token as the veil keeps it: who sees it and the light it gives off (lit, or `null`). */
export type VeiledToken = Readonly<{
  tokenId: string;
  controllerIds: readonly string[];
  light: VeiledLightDto | null;
}>;

/** The hidden tokens an event may name (or a snapshot holds). Empty = nothing to cut. */
export type TokenVeil = Readonly<{ tokens: readonly VeiledToken[] }>;

/** One audience of a veil and the ids it may not receive. */
export type VeilCut = Readonly<{ audience: VeilAudience; invisible: ReadonlySet<string> }>;

/** Drops from an event what is invisible to one audience; `null` = nothing of it is left. */
export type SeenBy<Event> = (event: Event, invisible: ReadonlySet<string>) => Event | null;

const NOTHING_HIDDEN: ReadonlySet<string> = new Set();

/** No cut: the event goes whole to the grid, as before the veil. */
export const NO_VEIL: VeilCuts<never> = [];

/** The veil of tokens read in a command or a snapshot: only the hidden ones enter it.
 *
 *  Example: `veilOf(await tokensIn(daos, scene, campaignId, ids))` */
export function veilOf(rows: readonly TokenRow[]): TokenVeil {
  return { tokens: rows.filter(({ token }) => token.hidden).map(veiledTokenOf) };
}

/** The veil of what `TokensDao.veilOfScene` read (every row is hidden).
 *
 *  Example: `sceneVeilOf(await daos.tokens.veilOfScene(scene.id))` */
export function sceneVeilOf(hidden: readonly HiddenTokenPo[]): TokenVeil {
  return { tokens: hidden.map(veiledTokenOf) };
}

/** Two veils as one, each token once (the first one's wins).
 *
 *  Example: `joinedVeil(veilOf(rows), sceneVeilOf(scene))` */
export function joinedVeil(first: TokenVeil, second: TokenVeil): TokenVeil {
  const ids = new Set(first.tokens.map(({ tokenId }) => tokenId));
  return { tokens: [...first.tokens, ...second.tokens.filter(({ tokenId }) => !ids.has(tokenId))] };
}

/** A hidden token's light, from the center of its footprint, only while lit.
 *
 *  Example: `veiledTokenOf(wolfRow).light // { x: 4, y: 5, bright: 4, … }` */
export function veiledTokenOf({ token, controllerIds }: HiddenTokenPo): VeiledToken {
  return { tokenId: token.id, controllerIds: [...controllerIds], light: veiledLightOf(token) };
}

/** The audiences of a veil: the masters (who see all), each controller of a hidden token (they see
 *  theirs) and the rest (who see none). Without a hidden token, no audience: nothing to cut.
 *  `alsoUserIds` get a cut of their own too (who just stopped controlling one).
 *
 *  Example: `veilCutsOf(veil).find(({ audience }) => audience.kind === 'rest')?.invisible` */
export function veilCutsOf(veil: TokenVeil, alsoUserIds: readonly string[] = []): VeilCut[] {
  if (veil.tokens.length === 0) return [];
  const controllerIds = [
    ...new Set([...veil.tokens.flatMap((t) => t.controllerIds), ...alsoUserIds]),
  ];
  const all = new Set(veil.tokens.map(({ tokenId }) => tokenId));
  const controllerCuts = controllerIds.map((userId) => ({
    audience: { kind: 'controller', userId } as const,
    invisible: invisibleTo(veil, userId),
  }));
  return [
    { audience: { kind: 'masters' }, invisible: NOTHING_HIDDEN },
    ...controllerCuts,
    { audience: { kind: 'rest', controllerIds }, invisible: all },
  ];
}

/** The cuts of one event: each audience gets what `seenBy` leaves of it (the masters, it whole).
 *  No hidden token in the veil = `NO_VEIL`.
 *
 *  Example: `cutsOf(event, veilOf(rows), entriesSeenBy('moves'))` */
export function cutsOf<Event>(
  event: Event,
  veil: TokenVeil,
  seenBy: SeenBy<Event>,
): VeilCuts<Event> {
  return veilCutsOf(veil).map(({ audience, invisible }) => ({
    audience,
    event: invisible.size === 0 ? event : seenBy(event, invisible),
  }));
}

/** An event of one token: whole, or nothing when that token is invisible.
 *
 *  Example: `cutsOf(movedEvent, veil, tokenSeenBy)` */
export function tokenSeenBy<Event extends Readonly<{ tokenId: string }>>(
  event: Event,
  invisible: ReadonlySet<string>,
): Event | null {
  return invisible.has(event.tokenId) ? null : event;
}

type EntriesKey<Event> = {
  [Key in keyof Event]: Event[Key] extends readonly Readonly<{ tokenId: string }>[] ? Key : never;
}[keyof Event];

/** A batch event without the entries of invisible tokens; `null` when none is left.
 *
 *  Example: `entriesSeenBy<TokensMovedDto>('moves')(event, new Set([wolfId]))` */
export function entriesSeenBy<Event>(key: EntriesKey<Event>): SeenBy<Event> {
  return (event, invisible) => {
    const entries = event[key] as readonly Readonly<{ tokenId: string }>[];
    const seen = entries.filter(({ tokenId }) => !invisible.has(tokenId));
    return seen.length === 0 ? null : { ...event, [key]: seen };
  };
}

/** A batch event that lists `tokenIds`, without the invisible ones; `null` when none is left.
 *
 *  Example: `cutsOf(layerEvent, veil, tokenIdsSeenBy)` */
export function tokenIdsSeenBy<Event extends Readonly<{ tokenIds: readonly string[] }>>(
  event: Event,
  invisible: ReadonlySet<string>,
): Event | null {
  const tokenIds = event.tokenIds.filter((tokenId) => !invisible.has(tokenId));
  return tokenIds.length === 0 ? null : { ...event, tokenIds };
}

/** The lit lights of the veil's tokens that are invisible to one audience.
 *
 *  Example: `veiledLightsOf(sceneVeil, cut.invisible)` */
export function veiledLightsOf(veil: TokenVeil, invisible: ReadonlySet<string>): VeiledLightDto[] {
  return veil.tokens.flatMap(({ tokenId, light }) =>
    light && invisible.has(tokenId) ? [light] : [],
  );
}

/** The ids of the veil a member does not receive: all of them, but the ones they control (a
 *  master receives every one: pass the veil only for who is not).
 *
 *  Example: `invisibleTo(veil, biaId) // the hidden tokens Bia does not control` */
export function invisibleTo(veil: TokenVeil, userId: string): ReadonlySet<string> {
  const unseen = veil.tokens.filter(({ controllerIds }) => !controllerIds.includes(userId));
  return new Set(unseen.map(({ tokenId }) => tokenId));
}

function veiledLightOf(token: HiddenTokenPo['token']): VeiledLightDto | null {
  if (!token.lightLit || token.lightBright === null || token.lightDim === null) return null;
  const { x, y } = tokenCenter(token, token);
  const range = { bright: Number(token.lightBright), dim: Number(token.lightDim) };
  return { x, y, ...range, color: token.lightColor, facing: token.facing, angle: token.lightAngle };
}

/** No veil for a token change: the adapter splits whole and redacted as always. */
export const NO_CHANGE_VEIL: TokenChangeVeil = { cuts: [], lost: [] };

/** The veil of what a query read of who controls each token (a drag, a combat): no light in it.
 *
 *  Example: `controlVeilOf(await daos.tokens.controlOfScene(scene.id))` */
export function controlVeilOf(
  tokens: readonly Readonly<{
    tokenId: string;
    controllerIds: readonly string[];
    hidden: boolean;
  }>[],
): TokenVeil {
  const hidden = tokens.filter((token) => token.hidden);
  return {
    tokens: hidden.map(({ tokenId, controllerIds }) => ({
      tokenId,
      controllerIds: [...controllerIds],
      light: null,
    })),
  };
}
