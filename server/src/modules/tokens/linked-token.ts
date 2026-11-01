import type { CharacterRow, CharactersDao } from '../characters/characters.dao';
import { CharacterNotFoundError } from '../characters/characters.error';
import type {
  CharacterBarInputPo,
  CharacterBarPo,
  CharacterLookChangesPo,
} from '../characters/characters.po';
import {
  requireCharactersLock,
  type LockedGridMaybeCharacters,
} from '../characters/locked-characters-grid';
import { requireCastLock, type LockedGridMaybeCast } from '../scenes/locked-cast';
import type { TokenRow, TokenUpdatePo } from './tokens.dao';
import type {
  TokenAuraPo,
  TokenBarPo,
  TokenFieldsPo,
  TokenFormInputPo,
  TokenPo,
} from './tokens.po';

/** What a token linked to a character shows of it, besides the bars and the controllers: the
 *  place, size, layer, facing, flips, sight, light and forms stay its own. The aura is the
 *  character's too (the paladin's aura goes with him to every grid). */
export type TokenIdentityPo = Pick<
  TokenPo,
  'name' | 'initials' | 'side' | 'imageAssetId' | 'frame' | 'defeated'
> &
  TokenAuraPo;

/** The identity of a token or a character, as a character lends it (and an unlinked token keeps
 *  a copy of it).
 *
 *  Example: `identityOf(lyra.character) // { name: 'Lyra', initials: 'LY', … }` */
export function identityOf(token: TokenIdentityPo): TokenIdentityPo {
  const { name, initials, side, imageAssetId, frame, defeated } = token;
  return { name, initials, side, imageAssetId, frame, defeated, ...auraColumnsOf(token) };
}

/** A token as every reader sees it: linked, it wears its character's identity, bars and
 *  controllers over its own place, look settings and forms in the grid; unlinked (or with the
 *  character not found), it is itself. The bars keep the character's ids (a bar write lands on
 *  the character).
 *
 *  Example: `composedTokenRow(lyraOfEstrada, lyra).bars // the character's PV` */
export function composedTokenRow(row: TokenRow, character: CharacterRow | undefined): TokenRow {
  if (!character || row.token.characterId !== character.character.id) return row;
  const tokenId = row.token.id;
  return {
    token: { ...row.token, ...identityOf(character.character) },
    bars: character.bars.map((bar) => tokenBarOf(bar, tokenId)),
    controllerIds: character.controllerIds,
    forms: row.forms,
  };
}

/** The token whose rows hold the conditions: the anchor of a linked token, the token itself
 *  otherwise (the conditions move to the character in a later phase of the plan).
 *
 *  Example: `await conditions.listOfTokens(rows.map(stateHolderIdOf))` */
export function stateHolderIdOf(row: TokenRow): string {
  return row.token.anchorTokenId ?? row.token.id;
}

/** Where a condition write on a token lands: its anchor (in the cast) or itself. */
export type StateHolder = Readonly<{ tokenId: string; inCast: boolean }>;

/** The holder of a token's conditions; a linked token needs the cast locked (the run starts
 *  again with it otherwise, see `requireCastLock`).
 *
 *  Example: `const holder = stateHolderIn(locked, lyra); await conditions.apply(holder.tokenId, …)` */
export function stateHolderIn(locked: LockedGridMaybeCast<unknown>, row: TokenRow): StateHolder {
  const anchorTokenId = row.token.anchorTokenId;
  if (anchorTokenId === null) return { tokenId: row.token.id, inCast: false };
  requireCastLock(locked);
  return { tokenId: anchorTokenId, inCast: true };
}

type CharacterReads = Readonly<{ characters: Pick<CharactersDao, 'findInCampaign'> }>;

/** The character a token wears, `null` for an unlinked one. A linked token needs the
 *  characters locked: without their lock, the run starts again with it
 *  (`requireCharactersLock`). Call it before the first write.
 *
 *  Example: `const lyra = await linkedCharacterIn(locked, row); if (lyra) await daos.characters.setBarValues(…)` */
export async function linkedCharacterIn(
  locked: LockedGridMaybeCharacters<CharacterReads>,
  row: TokenRow,
): Promise<CharacterRow | null> {
  const { characterId } = row.token;
  if (characterId === null) return null;
  requireCharactersLock(locked);
  return characterIn(locked.daos, locked.scene.campaignId, characterId);
}

/** The character of the table as saved now, or CHARACTER_NOT_FOUND citing the table and the id.
 *
 *  Example: `const reread = await characterIn(daos, campaignId, lyraId)` */
export async function characterIn(
  daos: CharacterReads,
  campaignId: string,
  characterId: string,
): Promise<CharacterRow> {
  const found = await daos.characters.findInCampaign(campaignId, characterId);
  if (!found) throw new CharacterNotFoundError(campaignId, characterId);
  return found;
}

type SharedStyle = Readonly<{
  imageAssetId?: unknown;
  frame?: unknown;
  defeated?: unknown;
  aura?: unknown;
}>;

/** The part of a style a linked token takes from its character (image, frame, defeat mark,
 *  aura) and the part that stays its own in the grid (flips, light switch). Works on the style as
 *  sent, so each part is also the style its event carries.
 *
 *  Example: `splitStyle({ defeated: true, flipX: true }) // { shared: { defeated: true }, own: { flipX: true } }` */
export function splitStyle<S extends SharedStyle>(
  style: S,
): Readonly<{ shared: Partial<S>; own: Partial<S> }> {
  const { imageAssetId, frame, defeated, aura, ...own } = style;
  const shared = definedOf({ imageAssetId, frame, defeated, aura }) as Partial<S>;
  return { shared, own: definedOf(own) as Partial<S> };
}

/** What a `token:update` of a linked token writes on its character: the identity, look and aura
 *  given, and the bars and controllers whole. */
export type SharedTokenUpdatePo = Readonly<{
  look: CharacterLookChangesPo;
  bars: readonly CharacterBarInputPo[];
  controllerIds: readonly string[];
}>;

/** What it writes on the token: size, sight, light, flips, the shown form and the forms. */
export type OwnTokenUpdatePo = Readonly<{
  fields: Partial<TokenFieldsPo>;
  forms?: readonly TokenFormInputPo[];
}>;

/** A `token:update` of a linked token, split: the identity, look, aura, bars and controllers go
 *  to its character, the rest (forms and shown form included) stays on the token.
 *
 *  Example: `const { shared, own } = splitUpdate(update)` */
export function splitUpdate(
  update: TokenUpdatePo,
): Readonly<{ shared: SharedTokenUpdatePo; own: OwnTokenUpdatePo }> {
  const { name, initials, side, imageAssetId, frame, ...rest } = update.fields;
  const { auraKind, auraRadius, auraColor, auraEffect, auraImageAssetId, auraOpacity, ...more } =
    rest;
  const { auraImageShape, ...own } = more;
  const aura = { auraKind, auraRadius, auraColor, auraEffect, auraImageAssetId, auraOpacity };
  const look = definedOf({ name, initials, side, imageAssetId, frame, ...aura, auraImageShape });
  const { bars, controllerIds } = update;
  const forms = update.forms === undefined ? {} : { forms: update.forms };
  return { shared: { look, bars, controllerIds }, own: { fields: definedOf(own), ...forms } };
}

function tokenBarOf(bar: CharacterBarPo, tokenId: string): TokenBarPo {
  const { id, position, label, current, max, color, visibility, display } = bar;
  return { id, tokenId, position, label, current, max, color, visibility, display };
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
