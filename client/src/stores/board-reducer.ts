import type {
  ActiveConditionDto,
  BoardStateDto,
  ConditionChangeDto,
  DrawingDto,
  DrawingsMovedDto,
  EffectAreaDto,
  EffectAreasReshapedDto,
  LightDto,
  LightColorsChangedDto,
  LightConesChangedDto,
  LightRangesChangedDto,
  LightsMovedDto,
  MainTokenDto,
  MemberCardDto,
  TokenDto,
  TokenFormChangedDto,
  TokensFacedDto,
  TokensResizedDto,
  TokensRestyledDto,
  TokensMovedDto,
  WallDto,
  WallKindsChangedDto,
  WallsMovedDto,
} from '@lorkarium/contracts';
import type { BoardEvent } from '@/services/board-events';
import {
  tokensShowingDefinition,
  tokensWithoutDefinition,
  withDefinitionReplaced,
  withDefinitionsAdded,
} from '@/lib/condition-catalog';

/** The board after one confirmed event, already checked to be `board.version + 1`.
 *
 *  Example: `applyBoardEvent(board, { type: 'tokenMoved', payload }).tokens` */
export function applyBoardEvent(board: BoardStateDto, event: BoardEvent): BoardStateDto {
  const { version, at } = event.payload;
  const next = { ...board, ...changesOf(board, event), version, at };
  return { ...next, mainTokens: mainTokensAfter(next, event) };
}

// The server drops a choice when its token goes or stops listing the person (cascade and
// `dropLostControl`), with no event of its own: the client does the same on every event.
function mainTokensAfter(board: BoardStateDto, event: BoardEvent): MainTokenDto[] {
  const chosen =
    event.type === 'mainTokenChanged'
      ? [...board.mainTokens.filter(({ userId }) => userId !== event.payload.userId), event.payload]
      : board.mainTokens;
  const kept = chosen.filter(({ userId, tokenId }) =>
    board.tokens.some(({ id, controllerIds }) => id === tokenId && controllerIds.includes(userId)),
  );
  return kept.map(({ userId, tokenId }) => ({ userId, tokenId }));
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
    case 'tokensFaced':
      return { tokens: withFacings(board.tokens, event.payload.faces) };
    case 'tokensResized':
      return { tokens: withBoxes(board.tokens, event.payload.resizes) };
    case 'tokensRestyled': {
      const { tokenIds, style } = event.payload;
      return { tokens: mapTokens(board.tokens, tokenIds, (token) => restyledToken(token, style)) };
    }
    case 'tokenFormChanged':
      return { tokens: withForm(board.tokens, event.payload) };
    case 'tokenDeleted':
      return {
        tokens: board.tokens.filter((token) => token.id !== event.payload.tokenId),
        combat: event.payload.combat,
      };
    case 'tokensHiddenChanged': {
      const { tokenIds, hidden } = event.payload;
      return { tokens: mapTokens(board.tokens, tokenIds, (token) => ({ ...token, hidden })) };
    }
    // Only the version moves: what changed is hidden from this viewer.
    case 'boardAdvanced':
      return {};
    default:
      return (
        batchChangesOf(board, event) ??
        effectAreaChangesOf(board, event) ??
        wallChangesOf(board, event) ??
        lightChangesOf(board, event) ??
        catalogChangesOf(board, event) ??
        combatChangesOf(board, event)
      );
  }
}

// Pastes, their undo and drawings; `null` when the event is none of these.
function batchChangesOf(board: BoardStateDto, event: BoardEvent): Partial<BoardStateDto> | null {
  switch (event.type) {
    case 'tokensCreated': {
      const { tokens, combat } = event.payload;
      return { tokens: tokens.reduce(withToken, [...board.tokens]), combat };
    }
    case 'tokensDeleted': {
      const { tokenIds, combat } = event.payload;
      return { tokens: board.tokens.filter(({ id }) => !tokenIds.includes(id)), combat };
    }
    case 'drawingsCreated':
      return { drawings: [...board.drawings, ...event.payload.drawings] };
    case 'drawingsMoved':
      return { drawings: withDrawingMoves(board.drawings, event.payload.moves) };
    case 'drawingsDeleted': {
      const { drawingIds } = event.payload;
      return { drawings: board.drawings.filter(({ id }) => !drawingIds.includes(id)) };
    }
    default:
      return null;
  }
}

// Areas of effect: created at the end (the drawing order), reshaped whole, deleted.
function effectAreaChangesOf(
  board: BoardStateDto,
  event: BoardEvent,
): Partial<BoardStateDto> | null {
  switch (event.type) {
    case 'effectAreasCreated':
      return { effectAreas: [...board.effectAreas, ...event.payload.effectAreas] };
    case 'effectAreasReshaped':
      return { effectAreas: withReshapes(board.effectAreas, event.payload.reshapes) };
    case 'effectAreasDeleted': {
      const { effectAreaIds } = event.payload;
      return { effectAreas: board.effectAreas.filter(({ id }) => !effectAreaIds.includes(id)) };
    }
    default:
      return null;
  }
}

// Walls: created at the end, moved, deleted, cut (what is left at the end), re-kinded (with the door state) and doors set.
function wallChangesOf(board: BoardStateDto, event: BoardEvent): Partial<BoardStateDto> | null {
  switch (event.type) {
    case 'wallsCreated':
      return { walls: [...board.walls, ...event.payload.walls] };
    case 'wallsMoved':
      return { walls: withWallMoves(board.walls, event.payload.moves) };
    case 'wallsDeleted': {
      const { wallIds } = event.payload;
      return { walls: board.walls.filter(({ id }) => !wallIds.includes(id)) };
    }
    case 'wallAreaErased': {
      const { wallIds, walls } = event.payload;
      return { walls: [...board.walls.filter(({ id }) => !wallIds.includes(id)), ...walls] };
    }
    case 'wallSegmentErased': {
      const { wallId, walls } = event.payload;
      return { walls: [...board.walls.filter(({ id }) => id !== wallId), ...walls] };
    }
    case 'wallKindsChanged':
      return { walls: withWallKinds(board.walls, event.payload.changes) };
    case 'doorChanged': {
      const { wallId, doorState } = event.payload;
      return {
        walls: board.walls.map((wall) => (wall.id === wallId ? { ...wall, doorState } : wall)),
      };
    }
    default:
      return null;
  }
}

// Map lights: created at the end, moved, re-ranged, lit or put out, deleted.
function lightChangesOf(board: BoardStateDto, event: BoardEvent): Partial<BoardStateDto> | null {
  switch (event.type) {
    case 'lightsCreated':
      return { lights: [...board.lights, ...event.payload.lights] };
    case 'lightsMoved':
      return { lights: withLightMoves(board.lights, event.payload.moves) };
    case 'lightRangesChanged':
      return { lights: withLightRanges(board.lights, event.payload.changes) };
    case 'lightColorsChanged':
      return { lights: withLightColors(board.lights, event.payload.changes) };
    case 'lightConesChanged':
      return { lights: withLightCones(board.lights, event.payload.changes) };
    case 'lightsLitChanged': {
      const { lightIds, lit } = event.payload;
      const switched = (light: LightDto): LightDto =>
        lightIds.includes(light.id) ? { ...light, lit } : light;
      return { lights: board.lights.map(switched) };
    }
    case 'lightsDeleted': {
      const { lightIds } = event.payload;
      return { lights: board.lights.filter(({ id }) => !lightIds.includes(id)) };
    }
    default:
      return null;
  }
}

function withLightMoves(lights: readonly LightDto[], moves: LightsMovedDto['moves']): LightDto[] {
  return lights.map((light) => {
    const move = moves.find(({ lightId }) => lightId === light.id);
    return move ? { ...light, x: move.x, y: move.y } : light;
  });
}

function withLightRanges(
  lights: readonly LightDto[],
  changes: LightRangesChangedDto['changes'],
): LightDto[] {
  return lights.map((light) => {
    const change = changes.find(({ lightId }) => lightId === light.id);
    return change ? { ...light, bright: change.bright, dim: change.dim } : light;
  });
}

function withLightColors(
  lights: readonly LightDto[],
  changes: LightColorsChangedDto['changes'],
): LightDto[] {
  return lights.map((light) => {
    const change = changes.find(({ lightId }) => lightId === light.id);
    return change ? { ...light, color: change.color } : light;
  });
}

function withLightCones(
  lights: readonly LightDto[],
  changes: LightConesChangedDto['changes'],
): LightDto[] {
  return lights.map((light) => {
    const change = changes.find(({ lightId }) => lightId === light.id);
    return change ? { ...light, facing: change.facing, angle: change.angle } : light;
  });
}

function withWallMoves(walls: readonly WallDto[], moves: WallsMovedDto['moves']): WallDto[] {
  return walls.map((wall) => {
    const move = moves.find(({ wallId }) => wallId === wall.id);
    return move ? { ...wall, x: move.x, y: move.y } : wall;
  });
}

function withWallKinds(
  walls: readonly WallDto[],
  changes: WallKindsChangedDto['changes'],
): WallDto[] {
  return walls.map((wall) => {
    const change = changes.find(({ wallId }) => wallId === wall.id);
    return change ? { ...wall, kind: change.kind, doorState: change.doorState } : wall;
  });
}

function withReshapes(
  areas: readonly EffectAreaDto[],
  reshapes: EffectAreasReshapedDto['reshapes'],
): EffectAreaDto[] {
  return areas.map((area) => {
    const reshape = reshapes.find(({ effectAreaId }) => effectAreaId === area.id);
    return reshape ? { ...reshape.shape, id: area.id, authorId: area.authorId } : area;
  });
}

function withDrawingMoves(
  drawings: readonly DrawingDto[],
  moves: DrawingsMovedDto['moves'],
): DrawingDto[] {
  return drawings.map((drawing) => {
    const move = moves.find(({ drawingId }) => drawingId === drawing.id);
    return move ? { ...drawing, x: move.x, y: move.y } : drawing;
  });
}

// The table's list (the cast's events): an edit shows on every token holding the condition, a
// deletion takes it off them, the restored defaults join the list once.
function catalogChangesOf(board: BoardStateDto, event: BoardEvent): Partial<BoardStateDto> | null {
  switch (event.type) {
    case 'conditionDefinitionUpdated': {
      const { definition } = event.payload;
      return {
        conditionDefinitions: withDefinitionReplaced(board.conditionDefinitions, definition),
        tokens: tokensShowingDefinition(board.tokens, definition),
      };
    }
    case 'conditionDefinitionDeleted': {
      const { conditionId } = event.payload;
      return {
        conditionDefinitions: board.conditionDefinitions.filter(({ id }) => id !== conditionId),
        tokens: tokensWithoutDefinition(board.tokens, conditionId),
      };
    }
    case 'conditionDefaultsRestored': {
      const { definitions } = event.payload;
      return {
        conditionDefinitions: withDefinitionsAdded(board.conditionDefinitions, definitions),
      };
    }
    default:
      return null;
  }
}

function combatChangesOf(board: BoardStateDto, event: BoardEvent): Partial<BoardStateDto> {
  switch (event.type) {
    case 'conditionDefined':
      return { conditionDefinitions: [...board.conditionDefinitions, event.payload.definition] };
    case 'memberCardChanged':
      return { memberCards: withMemberCard(board.memberCards, event.payload.card) };
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
    case 'conditionsChanged':
      return { tokens: withConditionChanges(board.tokens, event.payload.changes) };
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

function withBoxes(tokens: readonly TokenDto[], boxes: TokensResizedDto['resizes']): TokenDto[] {
  return tokens.map((token) => {
    const box = boxes.find(({ tokenId }) => tokenId === token.id);
    if (!box) return token;
    const { col, row, width, height } = box;
    // A size set by hand is no form any more, as the server does; a linked token keeps the
    // anchor's form, since its size is per grid.
    const resized = width !== token.width || height !== token.height;
    const activeFormId = resized && !token.anchorTokenId ? null : token.activeFormId;
    return { ...token, col, row, width, height, activeFormId };
  });
}

// An image or a frame set by hand is no form any more: the server clears it the same way.
function restyledToken(token: TokenDto, style: TokensRestyledDto['style']): TokenDto {
  const newImage = 'imageAssetId' in style && style.imageAssetId !== token.imageAssetId;
  const newFrame = style.frame !== undefined && style.frame !== token.frame;
  const activeFormId = newImage || newFrame ? null : token.activeFormId;
  return { ...token, ...style, activeFormId };
}

// The grid's event (with `box`) is its token's; the cast's (no box, the size being per grid)
// reaches the anchor and every token linked to it.
function withForm(tokens: readonly TokenDto[], change: TokenFormChangedDto): TokenDto[] {
  const { tokenId, activeFormId, imageAssetId, frame, box } = change;
  const switched = (token: TokenDto): boolean =>
    token.id === tokenId || (box === undefined && token.anchorTokenId === tokenId);
  return tokens.map((token) =>
    switched(token) ? { ...token, ...box, activeFormId, imageAssetId, frame } : token,
  );
}

function withFacings(tokens: readonly TokenDto[], faces: TokensFacedDto['faces']): TokenDto[] {
  return tokens.map((token) => {
    const face = faces.find(({ tokenId }) => tokenId === token.id);
    return face ? { ...token, facing: face.facing } : token;
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

function withMemberCard(cards: readonly MemberCardDto[], card: MemberCardDto): MemberCardDto[] {
  const found = cards.some(({ userId }) => userId === card.userId);
  if (!found) return [...cards, card];
  return cards.map((each) => (each.userId === card.userId ? card : each));
}
