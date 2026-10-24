import { requireCastLock, type LockedGridMaybeCast } from '../scenes/locked-cast';
import type { TokenRow, TokenUpdatePo } from './tokens.dao';
import type { TokenFieldsPo, TokenPo, TokenStylePo } from './tokens.po';

/** What a token linked to a character shows of its anchor, besides the bars, the controllers and
 *  the conditions: the place, size, layer, facing, flips, sight and light stay its own. */
export type TokenIdentityPo = Pick<
  TokenPo,
  'name' | 'initials' | 'side' | 'imageAssetId' | 'frame' | 'defeated'
>;

/** The identity of a token, as an anchor lends it (and an unlinked token keeps a copy of it).
 *
 *  Example: `identityOf(anchor.token) // { name: 'Lyra', initials: 'LY', … }` */
export function identityOf(token: TokenIdentityPo): TokenIdentityPo {
  const { name, initials, side, imageAssetId, frame, defeated } = token;
  return { name, initials, side, imageAssetId, frame, defeated };
}

/** A token as every reader sees it: linked, it wears its anchor's identity, bars and controllers
 *  over its own place in the grid; unlinked (or with the anchor not found), it is itself.
 *
 *  Example: `composedTokenRow(lyraOfEstrada, lyraAnchor).bars // the anchor's PV` */
export function composedTokenRow(row: TokenRow, anchor: TokenRow | undefined): TokenRow {
  if (!anchor || row.token.anchorTokenId !== anchor.token.id) return row;
  return {
    token: { ...row.token, ...identityOf(anchor.token) },
    bars: anchor.bars,
    controllerIds: anchor.controllerIds,
  };
}

/** The token whose rows hold the shared state (bars, conditions, controllers): the anchor of a
 *  linked token, the token itself otherwise.
 *
 *  Example: `await conditions.listOfTokens(rows.map(stateHolderIdOf))` */
export function stateHolderIdOf(row: TokenRow): string {
  return row.token.anchorTokenId ?? row.token.id;
}

/** Where a write on the shared state of a token lands: its anchor (in the cast) or itself. */
export type StateHolder = Readonly<{ tokenId: string; inCast: boolean }>;

/** The holder of a token's shared state; a linked token needs the cast locked (the run starts
 *  again with it otherwise, see `requireCastLock`).
 *
 *  Example: `const holder = stateHolderIn(locked, lyra); await conditions.apply(holder.tokenId, …)` */
export function stateHolderIn(locked: LockedGridMaybeCast<unknown>, row: TokenRow): StateHolder {
  const anchorTokenId = row.token.anchorTokenId;
  if (anchorTokenId === null) return { tokenId: row.token.id, inCast: false };
  requireCastLock(locked);
  return { tokenId: anchorTokenId, inCast: true };
}

/** The part of a style a linked token takes from its anchor (image, frame, defeat mark) and the
 *  part that stays its own in the grid (flips, light switch).
 *
 *  Example: `splitStyle({ defeated: true, flipX: true }) // { shared: { defeated: true }, own: { flipX: true } }` */
export function splitStyle(
  style: Partial<TokenStylePo>,
): Readonly<{ shared: Partial<TokenStylePo>; own: Partial<TokenStylePo> }> {
  const { imageAssetId, frame, defeated, ...own } = style;
  const shared = definedOf({ imageAssetId, frame, defeated });
  return { shared, own: definedOf(own) };
}

/** A `token:update` of a linked token, split: the identity, look, bars and controllers go to its
 *  anchor (which keeps its own size), the rest stays on the token.
 *
 *  Example: `const { anchor, own } = splitUpdate(update, anchorRow.token)` */
export function splitUpdate(
  update: TokenUpdatePo,
  anchor: Pick<TokenPo, 'width' | 'height'>,
): Readonly<{ anchor: TokenUpdatePo; own: Partial<TokenFieldsPo> }> {
  const { name, initials, side, imageAssetId, frame, ...own } = update.fields;
  const look = definedOf({ imageAssetId, frame });
  const { width, height } = anchor;
  const fields = { name, initials, side, width, height, ...look };
  return { anchor: { ...update, fields }, own: definedOf(own) };
}

function definedOf<T extends object>(fields: T): Partial<T> {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as Partial<T>;
}
