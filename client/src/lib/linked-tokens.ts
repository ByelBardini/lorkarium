import type {
  BoardStateDto,
  CharacterDto,
  ConditionDefinitionDto,
  TokenDto,
} from '@lorkarium/contracts';
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

/** What the room composes a grid's board over: the table stream — the table's characters and
 *  its list of conditions, in the stream's own version. */
export type TableLinks = Readonly<{
  characters: readonly CharacterDto[];
  conditionDefinitions: ConditionDefinitionDto[];
}>;

type ResolvedTokens = Readonly<{ characters: readonly CharacterDto[]; tokens: TokenDto[] }>;

type ResolvedBoard = TableLinks & Readonly<{ board: BoardStateDto }>;

// One remembered answer per input: the same input gives back the same object (no render loop).
const tokensMemo = new WeakMap<TokenDto[], ResolvedTokens>();
const boardMemo = new WeakMap<BoardStateDto, ResolvedBoard>();

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
 *  table's list of conditions from the table stream, whose version is the table's (the grid's
 *  copy stops at its own snapshot; the free tokens' conditions follow the list,
 *  `tokensOverCatalog`). The stream not synced yet (`null`) → the board.
 *
 *  Example: `boardWithTable(groupBoard, { characters, conditionDefinitions }).tokens` */
export function boardWithTable(board: BoardStateDto, links: TableLinks | null): BoardStateDto {
  if (!links) return board;
  const { characters, conditionDefinitions } = links;
  const known = boardMemo.get(board);
  if (known?.characters === characters && known.conditionDefinitions === conditionDefinitions) {
    return known.board;
  }
  const result = composedBoard(board, links);
  boardMemo.set(board, { characters, conditionDefinitions, board: result });
  return result;
}

function composedBoard(board: BoardStateDto, links: TableLinks): BoardStateDto {
  const linked = resolveLinkedTokens(board.tokens, links.characters);
  const definitions = links.conditionDefinitions;
  const tokens = tokensOverCatalog(linked, board.conditionDefinitions, definitions);
  const same = tokens === board.tokens && definitions === board.conditionDefinitions;
  return same ? board : { ...board, tokens, conditionDefinitions: definitions };
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
