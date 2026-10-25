import type { CombatDto, TokenDto, TokensCreatedDto } from '@lorkarium/contracts';
import { combatSeenBy } from '../combat/combat-veil.mapper';
import type {
  GridEvent,
  HiddenCut,
  TokenChange,
  TokenChangeVeil,
  TokensCreation,
  VeilAudience,
  VeilCuts,
  VeiledLightsChange,
} from '../scenes/board-publisher.port';
import {
  invisibleTo,
  joinedVeil,
  veilCutsOf,
  veiledLightsOf,
  type TokenVeil,
  type VeiledToken,
} from './token-veil.mapper';

type CreatedToken = TokensCreation['tokens'][number];
type EventBase = Readonly<{ campaignId: string; sceneId: string; version: number; at: string }>;

/** The hidden tokens of the scene before and after a change, and its combat after it. */
export type VeilChange = Readonly<{
  before: TokenVeil;
  after: TokenVeil;
  combat: CombatDto | null;
}>;

/** A paste (or any `token:createdMany`) cut by the veil: each audience gets its mix (whole what it
 *  controls, redacted the rest) without what it may not see, and the combat cut. No hidden token
 *  in the veil = `NO_VEIL` (the adapter mixes as always).
 *
 *  Example: `publisher.tokensCreated(creation, creationCutsOf(creation, veil))` */
export function creationCutsOf(
  creation: TokensCreation,
  veil: TokenVeil,
): VeilCuts<GridEvent<TokensCreatedDto>> {
  const { campaignId, sceneId, version, at, combat } = creation;
  const ownerIds = creation.tokens.flatMap(({ controllerIds }) => controllerIds);
  return veilCutsOf(veil, ownerIds).map(({ audience, invisible }) => {
    const seen = creation.tokens.filter(({ privileged }) => !invisible.has(privileged.id));
    const tokens = seen.map((token) => versionFor(audience, token));
    const cut = combatSeenBy(combat, invisible);
    const event = { campaignId, sceneId, version, at, tokens, combat: cut };
    return { audience, event: tokens.length === 0 && cut === null ? null : event };
  });
}

/** The veil of a `token:created` / `token:updated` of a hidden token: whole to the masters and its
 *  controllers, nothing (`board:advanced`) to the rest, and `token:deleted` (with the combat as
 *  they now see it) to who stopped controlling it. A visible token: no veil.
 *
 *  Example: `publisher.tokenChanged(change, changeVeilOf(change, row.token.hidden, former, change))` */
export function changeVeilOf(
  change: TokenChange,
  hidden: boolean,
  formerControllerIds: readonly string[],
  scene: Readonly<{ veil: TokenVeil; combat: CombatDto | null }>,
): TokenChangeVeil {
  if (!hidden) return { cuts: [], lost: [] };
  const losers = formerControllerIds.filter((userId) => !change.controllerIds.includes(userId));
  const controllerIds = [...new Set([...change.controllerIds, ...losers])];
  const cuts = [
    { audience: { kind: 'masters' } as const, event: change.privileged },
    ...change.controllerIds.map((userId) => ({
      audience: { kind: 'controller', userId } as const,
      event: change.privileged,
    })),
    { audience: { kind: 'rest', controllerIds } as const, event: null },
  ];
  const { campaignId, sceneId, version, at, token } = change.privileged;
  const lost = losers.map((userId) => {
    const combat = combatSeenBy(scene.combat, invisibleTo(scene.veil, userId));
    return { userId, event: { campaignId, sceneId, version, at, tokenId: token.id, combat } };
  });
  return { cuts, lost };
}

/** What each audience receives when `changed` hide (or show): who keeps seeing them, the flag;
 *  who stops, `token:deletedMany`; who starts, `token:createdMany` (with every changed token, so
 *  the flag of the ones it saw is updated too). Each gets the combat as it sees it after.
 *
 *  Example: `hiddenCutsOf(base, changed, true, { before, after, combat })` */
export function hiddenCutsOf(
  base: EventBase,
  changed: readonly CreatedToken[],
  hidden: boolean,
  scene: VeilChange,
): HiddenCut[] {
  const tokenIds = changed.map(({ privileged }) => privileged.id);
  const audiences = veilCutsOf(joinedVeil(scene.before, scene.after)).map((c) => c.audience);
  return audiences.map((audience) => {
    const before = invisibleFor(audience, scene.before);
    const after = invisibleFor(audience, scene.after);
    const combat = combatSeenBy(scene.combat, after);
    const crossing = tokenIds.filter((id) => (hidden ? after : before).has(id));
    if (crossing.length === 0) {
      const seen = { ...base, tokenIds, hidden };
      return { audience, name: 'token:hiddenChanged', event: seen };
    }
    if (hidden)
      return {
        audience,
        name: 'token:deletedMany',
        event: { ...base, tokenIds: crossing, combat },
      };
    const tokens = changed.map((token) => versionFor(audience, token));
    return { audience, name: 'token:createdMany', event: { ...base, tokens, combat } };
  });
}

/** The new list of veiled lights of each audience to which a `touched` hidden token (moved, lit,
 *  hidden, shown, deleted…) is invisible; the masters never have one. `after` is every hidden
 *  token of the scene after the change.
 *
 *  Example: `publisher.veiledLightsChanged({ …, cuts: veiledLightsCutsOf(after, touched) })` */
export function veiledLightsCutsOf(
  after: TokenVeil,
  touched: readonly VeiledToken[],
): VeiledLightsChange['cuts'] {
  const all = joinedVeil(after, { tokens: touched });
  return veilCutsOf(all).flatMap(({ audience, invisible }) => {
    if (audience.kind === 'masters') return [];
    if (!touched.some(({ tokenId }) => invisible.has(tokenId))) return [];
    return [{ audience, lights: veiledLightsOf(after, invisible) }];
  });
}

/** The ids of a veil one audience does not receive.
 *
 *  Example: `invisibleFor({ kind: 'rest', controllerIds: [] }, veil) // every id of it` */
export function invisibleFor(audience: VeilAudience, veil: TokenVeil): ReadonlySet<string> {
  if (audience.kind === 'masters') return new Set();
  if (audience.kind === 'controller') return invisibleTo(veil, audience.userId);
  return new Set(veil.tokens.map(({ tokenId }) => tokenId));
}

function versionFor(audience: VeilAudience, token: CreatedToken): TokenDto {
  if (audience.kind === 'masters') return token.privileged;
  const controls = audience.kind === 'controller' && token.controllerIds.includes(audience.userId);
  return controls ? token.privileged : token.others;
}
