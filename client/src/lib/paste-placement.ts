import type {
  CombatDto,
  DrawingDto,
  DrawingShapeInput,
  EffectAreaDto,
  EffectAreaShapeDto,
  NewTokenInput,
  TokenDto,
} from '@lorkarium/contracts';
import { shiftEffectArea, type Cell, type SceneSize } from '@lorkarium/game-core';
import { entryOfToken } from './combat-entries';
import { toHundredth } from './drawing-geometry';
import { sentShapeOf, shapeOfEffectArea } from './effect-area-shape';

/** What Ctrl+C keeps: the tokens, drawings and areas of effect of the selection, ready to be
 *  created again. */
export type CopiedSelection = Readonly<{
  tokens: readonly NewTokenInput[];
  drawings: readonly DrawingShapeInput[];
  effectAreas: readonly EffectAreaShapeDto[];
}>;

type Span = Readonly<{ min: number; max: number }>;

/** The selection as the copy area keeps it: a token keeps name, side, size, bars, controllers
 *  and layer (a clean copy: no conditions), and, in the middle of a combat, the entry of its
 *  original (`combatantId`), which the paste joins; a drawing its shape and style; an area of
 *  effect its shape and color (no id, no author).
 *
 *  Example: `edits.getState().copy(copiedOf(selectedTokens, selectedDrawings, selectedAreas, board.combat))` */
export function copiedOf(
  tokens: readonly TokenDto[],
  drawings: readonly DrawingDto[],
  effectAreas: readonly EffectAreaDto[] = [],
  combat: CombatDto | null = null,
): CopiedSelection {
  return {
    tokens: tokens.map((token) => newTokenOf(token, entryOfToken(combat, token.id)?.id)),
    drawings: drawings.map(shapeOfDrawing),
    effectAreas: effectAreas.map(shapeOfEffectArea),
  };
}

/** A confirmed drawing as a shape to create again (no id, no author).
 *
 *  Example: `commands.createDrawings(campaignId, [shapeOfDrawing(drawing)])` */
export function shapeOfDrawing(drawing: DrawingDto): DrawingShapeInput {
  const { x, y, width, height, stroke, strokeWidth, layer } = drawing;
  const style = { x, y, width, height, stroke, strokeWidth, layer };
  if (drawing.kind === 'freehand') return { kind: 'freehand', ...style, points: drawing.points };
  return { kind: drawing.kind, ...style, fill: drawing.fill };
}

/** Where a paste lands: the center cell of the group goes to the cell under the cursor (with no
 *  cursor, one cell right and down of the original), every item moves by the same whole cells
 *  (an area keeps where its shape is born), and a group that would leave the scene is pushed back
 *  in by the edge (an area counts by its origin, the rest of it is clipped). `null` when the group
 *  is bigger than the scene.
 *
 *  Example: `const placed = pastePlacement(copied, interaction.hoverCell, scene)` */
export function pastePlacement(
  copied: CopiedSelection,
  cursor: Cell | null,
  scene: SceneSize,
): CopiedSelection | null {
  const cols = spanOf([
    ...copied.tokens.map(tokenCols),
    ...copied.drawings.map(drawingCols),
    ...copied.effectAreas.map(({ x }) => ({ min: x, max: x })),
  ]);
  const rows = spanOf([
    ...copied.tokens.map(tokenRows),
    ...copied.drawings.map(drawingRows),
    ...copied.effectAreas.map(({ y }) => ({ min: y, max: y })),
  ]);
  if (!cols || !rows) return null;
  const dx = inside(cols, cursor ? cursor.col - centerOf(cols) : 1, scene.widthCells);
  const dy = inside(rows, cursor ? cursor.row - centerOf(rows) : 1, scene.heightCells);
  if (dx === null || dy === null) return null;
  return {
    tokens: copied.tokens.map((token) => ({ ...token, col: token.col + dx, row: token.row + dy })),
    drawings: copied.drawings.map((shape) => ({
      ...shape,
      x: toHundredth(shape.x + dx),
      y: toHundredth(shape.y + dy),
    })),
    effectAreas: copied.effectAreas.map((shape) =>
      sentShapeOf(shiftEffectArea(shape, dx, dy), shape.color),
    ),
  };
}

function newTokenOf(token: TokenDto, combatantId: string | undefined): NewTokenInput {
  const { name, initials, side, width, height, col, row, layer, controllerIds } = token;
  const { imageAssetId, frame, flipX, flipY, facing } = token;
  const look = {
    imageAssetId,
    frame,
    flipX,
    flipY,
    facing,
    sight: token.sight,
    light: token.light,
  };
  const bars = token.bars.map(({ label, current, max, color, visibility }) => ({
    label,
    current,
    max,
    color,
    visibility,
  }));
  const controllers = [...controllerIds];
  return {
    name,
    initials,
    side,
    width,
    height,
    col,
    row,
    layer,
    controllerIds: controllers,
    ...look,
    bars,
    ...(combatantId && { combatantId }),
  };
}

function tokenCols(token: NewTokenInput): Span {
  return { min: token.col, max: token.col + token.width };
}

function tokenRows(token: NewTokenInput): Span {
  return { min: token.row, max: token.row + token.height };
}

function drawingCols(shape: DrawingShapeInput): Span {
  return { min: shape.x, max: shape.x + shape.width };
}

function drawingRows(shape: DrawingShapeInput): Span {
  return { min: shape.y, max: shape.y + shape.height };
}

function spanOf(spans: readonly Span[]): Span | null {
  if (spans.length === 0) return null;
  return {
    min: Math.min(...spans.map(({ min }) => min)),
    max: Math.max(...spans.map(({ max }) => max)),
  };
}

// The cell the middle of the group falls in.
function centerOf(span: Span): number {
  return Math.floor((span.min + span.max) / 2);
}

// The whole-cell shift that keeps the span inside 0..limit, or `null` when it cannot fit.
function inside(span: Span, shift: number, limit: number): number | null {
  if (span.max - span.min > limit) return null;
  let delta = shift;
  if (span.max + delta > limit) delta -= Math.ceil(span.max + delta - limit);
  if (span.min + delta < 0) delta += Math.ceil(-(span.min + delta));
  return delta;
}
