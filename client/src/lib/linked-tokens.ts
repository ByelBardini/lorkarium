import type { BoardStateDto, CharacterDto, TokenDto } from '@lorkarium/contracts';
import { tokensOverCatalog } from './condition-catalog';

/** What a token linked to a character wears from it, in every grid. */
const SHARED_FIELDS = [
  'name',
  'initials',
  'side',
  'imageAssetId',
  'frame',
  'defeated',
  'aura',
  'bars',
  'conditions',
  'controllerIds',
  'canControl',
] as const satisfies ReadonlyArray<keyof TokenDto & keyof CharacterDto>;

type SharedField = (typeof SHARED_FIELDS)[number];

/** What the room composes a grid's board over: the table's cast (its list of conditions, in the
 *  table's version) and the table's characters (`null` while either loads). */
export type TableLinks = Readonly<{
  cast: BoardStateDto | null;
  characters: readonly CharacterDto[] | null;
}>;

type ResolvedTokens = Readonly<{ characters: readonly CharacterDto[]; tokens: TokenDto[] }>;

type ResolvedBoard = TableLinks & Readonly<{ board: BoardStateDto }>;

// One remembered answer per input: the same input gives back the same object (no render loop).
const tokensMemo = new WeakMap<TokenDto[], ResolvedTokens>();
const boardMemo = new WeakMap<BoardStateDto, ResolvedBoard>();

const NO_CHARACTERS: readonly CharacterDto[] = [];

/** The tokens of a grid with each linked one wearing its character's identity, look, aura,
 *  bars, conditions and control; position, size, layer, facing, flips, forms, sight and light stay
 *  the token's own. A free token, or one whose character is not known (still loading), passes
 *  as it came. Nothing changed → the same array.
 *
 *  Example: `resolveLinkedTokens(grid.tokens, characters).find(({ id }) => id === lyraId)?.bars` */
export function resolveLinkedTokens(
  tokens: TokenDto[],
  characters: readonly CharacterDto[],
): TokenDto[] {
  const known = tokensMemo.get(tokens);
  if (known?.characters === characters) return known.tokens;
  const byId = new Map(characters.map((character) => [character.id, character]));
  const resolved = tokens.map((token) => withCharacterOf(token, byId));
  const changed = resolved.some((token, index) => token !== tokens[index]);
  const result = changed ? resolved : tokens;
  tokensMemo.set(tokens, { characters, tokens: result });
  return result;
}

/** A grid's board as the room shows it: the linked tokens wearing their characters, and the
 *  table's list of conditions from the cast, whose version is the table's (the grid's copy stops
 *  at its own snapshot; the tokens' conditions follow the list, `tokensOverCatalog`). Nothing
 *  known yet → the board.
 *
 *  Example: `boardWithTable(groupBoard, { cast, characters }).tokens` */
export function boardWithTable(board: BoardStateDto, links: TableLinks): BoardStateDto {
  const { cast, characters } = links;
  if (!cast && !characters) return board;
  const known = boardMemo.get(board);
  if (known?.cast === cast && known.characters === characters) return known.board;
  const linked = resolveLinkedTokens(board.tokens, characters ?? NO_CHARACTERS);
  const definitions = cast?.conditionDefinitions ?? board.conditionDefinitions;
  const tokens = tokensOverCatalog(linked, board.conditionDefinitions, definitions);
  const same = tokens === board.tokens && definitions === board.conditionDefinitions;
  const result = same ? board : { ...board, tokens, conditionDefinitions: definitions };
  boardMemo.set(board, { cast, characters, board: result });
  return result;
}

function withCharacterOf(token: TokenDto, characters: ReadonlyMap<string, CharacterDto>): TokenDto {
  const character = token.characterId ? characters.get(token.characterId) : undefined;
  if (!character || sharesAll(token, character)) return token;
  return { ...token, ...sharedOf(character) };
}

// By reference: once resolved, a token holds its character's arrays until either side changes.
function sharesAll(token: TokenDto, character: CharacterDto): boolean {
  return SHARED_FIELDS.every((field) => token[field] === character[field]);
}

function sharedOf(character: CharacterDto): Pick<TokenDto, SharedField> {
  const { name, initials, side, imageAssetId, frame, defeated, aura } = character;
  const { bars, conditions, controllerIds, canControl } = character;
  return {
    name,
    initials,
    side,
    imageAssetId,
    frame,
    defeated,
    aura,
    bars,
    conditions,
    controllerIds,
    canControl,
  };
}
