import type { BoardStateDto, TokenDto } from '@lorkarium/contracts';
import { tokensOverCatalog } from './condition-catalog';

/** What a token linked to a character card shares with its anchor, in every grid. */
const SHARED_FIELDS = [
  'name',
  'initials',
  'side',
  'imageAssetId',
  'frame',
  'defeated',
  'bars',
  'conditions',
  'controllerIds',
  'canControl',
] as const satisfies ReadonlyArray<keyof TokenDto>;

type SharedField = (typeof SHARED_FIELDS)[number];

type ResolvedTokens = Readonly<{ anchors: readonly TokenDto[]; tokens: TokenDto[] }>;

type ResolvedBoard = Readonly<{ cast: BoardStateDto | null; board: BoardStateDto }>;

// One remembered answer per input: the same input gives back the same object (no render loop).
const tokensMemo = new WeakMap<TokenDto[], ResolvedTokens>();
const boardMemo = new WeakMap<BoardStateDto, ResolvedBoard>();

/** The tokens of a grid with each linked one showing its anchor's identity, bars, conditions and
 *  control (the anchors live in the cast); position, size, layer, facing, flips, sight and light
 *  stay the token's own. A loose token, or a linked one whose anchor is not known yet (the cast
 *  still loading), passes as it came. Nothing changed → the same array.
 *
 *  Example: `resolveLinkedTokens(grid.tokens, cast.tokens).find(({ id }) => id === lyraId)?.bars` */
export function resolveLinkedTokens(tokens: TokenDto[], anchors: readonly TokenDto[]): TokenDto[] {
  const known = tokensMemo.get(tokens);
  if (known?.anchors === anchors) return known.tokens;
  const resolved = tokens.map((token) => withAnchorOf(token, anchors));
  const changed = resolved.some((token, index) => token !== tokens[index]);
  const result = changed ? resolved : tokens;
  tokensMemo.set(tokens, { anchors, tokens: result });
  return result;
}

/** A grid's board as the room shows it once the cast is known: the linked tokens resolved, and
 *  the table's pieces — the cards and the conditions defined — from the cast, whose version is
 *  the table's (the grid's copy of them stops at its own snapshot). The list's edits and
 *  deletions only reach the cast, so the loose tokens' conditions follow it here
 *  (`tokensOverCatalog`). `cast: null` → the board.
 *
 *  Example: `boardWithCast(groupBoard, castBoard).memberCards` */
export function boardWithCast(board: BoardStateDto, cast: BoardStateDto | null): BoardStateDto {
  if (!cast) return board;
  const known = boardMemo.get(board);
  if (known?.cast === cast) return known.board;
  const linked = resolveLinkedTokens(board.tokens, cast.tokens);
  const tokens = tokensOverCatalog(linked, board.conditionDefinitions, cast.conditionDefinitions);
  const same =
    tokens === board.tokens &&
    cast.memberCards === board.memberCards &&
    cast.conditionDefinitions === board.conditionDefinitions;
  const { memberCards, conditionDefinitions } = cast;
  const result = same ? board : { ...board, tokens, memberCards, conditionDefinitions };
  boardMemo.set(board, { cast, board: result });
  return result;
}

function withAnchorOf(token: TokenDto, anchors: readonly TokenDto[]): TokenDto {
  if (token.anchorTokenId === null) return token;
  const anchor = anchors.find(({ id }) => id === token.anchorTokenId);
  if (!anchor || sharesAll(token, anchor)) return token;
  return { ...token, ...sharedOf(anchor) };
}

// By reference: once resolved, a token holds its anchor's arrays until either side changes.
function sharesAll(token: TokenDto, anchor: TokenDto): boolean {
  return SHARED_FIELDS.every((field) => token[field] === anchor[field]);
}

function sharedOf(anchor: TokenDto): Pick<TokenDto, SharedField> {
  const { name, initials, side, imageAssetId, frame, defeated } = anchor;
  const { bars, conditions, controllerIds, canControl } = anchor;
  return {
    name,
    initials,
    side,
    imageAssetId,
    frame,
    defeated,
    bars,
    conditions,
    controllerIds,
    canControl,
  };
}
