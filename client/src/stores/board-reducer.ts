import type {
  ActiveConditionDto,
  BoardStateDto,
  ConditionChangeDto,
  TokenDto,
  TokensMovedDto,
} from '@lorkarium/contracts';
import type { BoardEvent } from '@/services/board-events';

/** The board after one confirmed event, already checked to be `board.version + 1`.
 *
 *  Example: `applyBoardEvent(board, { type: 'tokenMoved', payload }).tokens` */
export function applyBoardEvent(board: BoardStateDto, event: BoardEvent): BoardStateDto {
  const { version, at } = event.payload;
  return { ...board, ...changesOf(board, event), version, at };
}

function changesOf(board: BoardStateDto, event: BoardEvent): Partial<BoardStateDto> {
  switch (event.type) {
    case 'sceneUpdated':
      return { scene: event.payload.scene };
    case 'tokenCreated':
    case 'tokenUpdated':
      return { tokens: withToken(board.tokens, event.payload.token) };
    case 'tokenMoved': {
      const { tokenId, col, row } = event.payload;
      return { tokens: mapToken(board.tokens, tokenId, (token) => ({ ...token, col, row })) };
    }
    case 'tokensMoved':
      return { tokens: withMoves(board.tokens, event.payload.moves) };
    case 'tokenLayerChanged': {
      const { tokenIds, layer } = event.payload;
      return { tokens: mapTokens(board.tokens, tokenIds, (token) => ({ ...token, layer })) };
    }
    case 'tokenDeleted':
      return {
        tokens: board.tokens.filter((token) => token.id !== event.payload.tokenId),
        combat: event.payload.combat,
      };
    default:
      return combatChangesOf(board, event);
  }
}

function combatChangesOf(board: BoardStateDto, event: BoardEvent): Partial<BoardStateDto> {
  switch (event.type) {
    case 'conditionDefined':
      return { conditionDefinitions: [...board.conditionDefinitions, event.payload.definition] };
    case 'conditionApplied': {
      const { tokenId, condition } = event.payload;
      return {
        tokens: mapToken(board.tokens, tokenId, (token) => withCondition(token, condition)),
      };
    }
    case 'conditionsApplied':
      return {
        tokens: event.payload.applied.reduce(
          (tokens, { tokenId, condition }) =>
            mapToken(tokens, tokenId, (token) => withCondition(token, condition)),
          board.tokens,
        ),
      };
    case 'conditionRemoved': {
      const { tokenId, activeConditionId } = event.payload;
      const without = (token: TokenDto): TokenDto => ({
        ...token,
        conditions: token.conditions.filter(({ id }) => id !== activeConditionId),
      });
      return { tokens: mapToken(board.tokens, tokenId, without) };
    }
    case 'combatStarted':
    case 'combatUpdated':
      return { combat: event.payload.combat };
    case 'combatTurnChanged':
      return {
        combat: event.payload.combat,
        tokens: withConditionChanges(board.tokens, event.payload.conditionChanges),
      };
    case 'combatEnded':
      return { combat: null };
    default:
      return {};
  }
}

// Created or updated: replaced in place when known, appended when new.
function withToken(tokens: readonly TokenDto[], token: TokenDto): TokenDto[] {
  if (!tokens.some(({ id }) => id === token.id)) return [...tokens, token];
  return tokens.map((current) => (current.id === token.id ? token : current));
}

function withMoves(tokens: readonly TokenDto[], moves: TokensMovedDto['moves']): TokenDto[] {
  return tokens.map((token) => {
    const move = moves.find(({ tokenId }) => tokenId === token.id);
    return move ? { ...token, col: move.col, row: move.row } : token;
  });
}

function mapTokens(
  tokens: readonly TokenDto[],
  tokenIds: readonly string[],
  change: (token: TokenDto) => TokenDto,
): TokenDto[] {
  return tokens.map((token) => (tokenIds.includes(token.id) ? change(token) : token));
}

function mapToken(
  tokens: readonly TokenDto[],
  tokenId: string,
  change: (token: TokenDto) => TokenDto,
): TokenDto[] {
  return tokens.map((token) => (token.id === tokenId ? change(token) : token));
}

// Applying a condition again replaces its duration in place.
function withCondition(token: TokenDto, condition: ActiveConditionDto): TokenDto {
  const others = token.conditions.filter(
    ({ conditionId }) => conditionId !== condition.conditionId,
  );
  const known = others.length < token.conditions.length;
  const conditions = known
    ? token.conditions.map((current) =>
        current.conditionId === condition.conditionId ? condition : current,
      )
    : [...token.conditions, condition];
  return { ...token, conditions };
}

function withConditionChanges(
  tokens: readonly TokenDto[],
  changes: readonly ConditionChangeDto[],
): TokenDto[] {
  return tokens.map((token) => {
    const change = changes.find(({ tokenId }) => tokenId === token.id);
    return change ? { ...token, conditions: change.conditions } : token;
  });
}
