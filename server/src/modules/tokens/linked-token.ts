import { requireCastLock, type LockedGridMaybeCast } from '../scenes/locked-cast';
import type { TokenRow, TokenUpdatePo } from './tokens.dao';
import type { TokenAuraPo, TokenFieldsPo, TokenPo } from './tokens.po';

/** What a token linked to a character shows of its anchor, besides the bars, the controllers and
 *  the conditions: the place, size, layer, facing, flips, sight and light stay its own. The aura
 *  is the character's too (the paladin's aura goes with him to every grid). */
export type TokenIdentityPo = Pick<
  TokenPo,
  'name' | 'initials' | 'side' | 'imageAssetId' | 'frame' | 'defeated'
> &
  TokenAuraPo;

/** The identity of a token, as an anchor lends it (and an unlinked token keeps a copy of it).
 *
 *  Example: `identityOf(anchor.token) // { name: 'Lyra', initials: 'LY', … }` */
export function identityOf(token: TokenIdentityPo): TokenIdentityPo {
  const { name, initials, side, imageAssetId, frame, defeated } = token;
  return { name, initials, side, imageAssetId, frame, defeated, ...auraColumnsOf(token) };
}

/** A token as every reader sees it: linked, it wears its anchor's identity, bars, controllers,
 *  forms and shown form over its own place in the grid; unlinked (or with the anchor not found),
 *  it is itself.
 *
 *  Example: `composedTokenRow(lyraOfEstrada, lyraAnchor).bars // the anchor's PV` */
export function composedTokenRow(row: TokenRow, anchor: TokenRow | undefined): TokenRow {
  if (!anchor || row.token.anchorTokenId !== anchor.token.id) return row;
  const { activeFormId } = anchor.token;
  return {
    token: { ...row.token, ...identityOf(anchor.token), activeFormId },
    bars: anchor.bars,
    controllerIds: anchor.controllerIds,
    forms: anchor.forms,
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

type SharedStyle = Readonly<{
  imageAssetId?: unknown;
  frame?: unknown;
  defeated?: unknown;
  aura?: unknown;
}>;

/** The part of a style a linked token takes from its anchor (image, frame, defeat mark, aura) and
 *  the part that stays its own in the grid (flips, light switch). Works on the style as sent, so
 *  each part is also the style its event carries.
 *
 *  Example: `splitStyle({ defeated: true, flipX: true }) // { shared: { defeated: true }, own: { flipX: true } }` */
export function splitStyle<S extends SharedStyle>(
  style: S,
): Readonly<{ shared: Partial<S>; own: Partial<S> }> {
  const { imageAssetId, frame, defeated, aura, ...own } = style;
  const shared = definedOf({ imageAssetId, frame, defeated, aura }) as Partial<S>;
  return { shared, own: definedOf(own) as Partial<S> };
}

/** A `token:update` of a linked token, split: the identity, look, bars, controllers, forms and
 *  shown form go to its anchor (which keeps its own size), the rest stays on the token.
 *
 *  Example: `const { anchor, own } = splitUpdate(update, anchorRow.token)` */
export function splitUpdate(
  update: TokenUpdatePo,
  anchor: Pick<TokenPo, 'width' | 'height'>,
): Readonly<{ anchor: TokenUpdatePo; own: Partial<TokenFieldsPo> }> {
  const { name, initials, side, imageAssetId, frame, activeFormId, ...rest } = update.fields;
  const { auraKind, auraRadius, auraColor, auraEffect, auraImageAssetId, auraOpacity, ...more } =
    rest;
  const { auraImageShape, ...own } = more;
  const aura = { auraKind, auraRadius, auraColor, auraEffect, auraImageAssetId, auraOpacity };
  const look = definedOf({ imageAssetId, frame, activeFormId, ...aura, auraImageShape });
  const { width, height } = anchor;
  const fields = { name, initials, side, width, height, ...look };
  return { anchor: { ...update, fields }, own: definedOf(own) };
}

function auraColumnsOf(token: TokenAuraPo): TokenAuraPo {
  const { auraKind, auraRadius, auraColor, auraEffect, auraImageAssetId, auraOpacity } = token;
  const { auraImageShape } = token;
  return {
    auraKind,
    auraRadius,
    auraColor,
    auraEffect,
    auraImageAssetId,
    auraOpacity,
    auraImageShape,
  };
}

function definedOf<T extends object>(fields: T): Partial<T> {
  const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as Partial<T>;
}
