import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { combatDto } from './combat.dto';
import { activeConditionDto } from './condition.dto';
import { coneAngleDto, facingDto } from './direction.dto';
import { tokenLightDto } from './light.dto';
import { REACH_MAX, reachSideDto } from './reach.dto';
import { tokenAuraDto } from './token-aura.dto';

export const MAX_BARS_PER_TOKEN = 8;
/** Tokens a scene keeps at most (above the 300 of the target scale; it protects snapshot and render). */
export const TOKENS_PER_SCENE_MAX = 500;
/** The refusal code of a create or paste that would pass `TOKENS_PER_SCENE_MAX`, all or nothing. */
export const TOKEN_LIMIT_CODE = 'TOKEN_LIMIT';
/** The bar values stop at ±this (current) and the maximum goes up to it. */
export const BAR_VALUE_LIMIT = 99_999;
export const TOKEN_NAME_MAX_LENGTH = 60;
export const TOKEN_INITIALS_MAX_LENGTH = 3;
export const BAR_LABEL_MAX_LENGTH = 24;
/** A token side goes from half a cell to ten, in steps of half a cell (game-core `tokenSize`). */
export const TOKEN_SIZE_MIN = 0.5;
export const TOKEN_SIZE_MAX = 10;

export const tokenSideDto = z.enum(['ally', 'enemy', 'neutral']);
export type TokenSideDto = z.infer<typeof tokenSideDto>;

/** The three drawing layers of a scene; the order is the drawing order, top to bottom. */
export const tokenLayerDto = z.enum(['tokens', 'objects', 'background']);
export type TokenLayerDto = z.infer<typeof tokenLayerDto>;

/** The five bar colors of the design system (`chart-1..4` and ash), never a free hex. */
export const barColorDto = z.enum(['gold', 'steel', 'ember', 'moss', 'ash']);
export type BarColorDto = z.infer<typeof barColorDto>;

/** "Todos veem" or "Só mestre e quem controla": the server omits a `controllers` bar for others. */
export const barVisibilityDto = z.enum(['everyone', 'controllers']);
export type BarVisibilityDto = z.infer<typeof barVisibilityDto>;

/** How every viewer reads the numbers of a bar: "32 / 45" or "71%". Only the display: the
 *  values travel the same either way. */
export const barDisplayDto = z.enum(['number', 'percent']);
export type BarDisplayDto = z.infer<typeof barDisplayDto>;

/** `square` shows the whole image (contain); `round` crops it to a circle (cover) with the side ring. */
export const tokenFrameDto = z.enum(['square', 'round']);
export type TokenFrameDto = z.infer<typeof tokenFrameDto>;

/** The look of a token; not a secret, so every audience gets the same values. `defeated` (the red
 *  cross of a fallen foe) changes only by `token:restyleMany`: a new token or a copy is alive. */
const tokenAppearanceShape = {
  imageAssetId: z.uuid().nullable(),
  frame: tokenFrameDto,
  flipX: z.boolean(),
  flipY: z.boolean(),
  defeated: z.boolean(),
};

/** The longest bright or dim sight, in cells (game-core `SIGHT_RANGE_MAX`). */
export const SIGHT_RANGE_MAX = REACH_MAX;
/** Bends one move may carry (the drag's path around walls). */
export const MOVE_PATH_MAX = 32;

/** How far a token sees, in cells: fully up to `bright`, then `dim` more in silhouettes
 *  (game-core `sightRange`, rewritten because contracts depends only on zod). `null` = blind.
 *
 *  Example: `sightDto.parse({ bright: 12, dim: 4 })` */
export const sightDto = z.strictObject({
  bright: reachSideDto('sight', 'bright'),
  dim: reachSideDto('sight', 'dim'),
});
export type SightDto = z.infer<typeof sightDto>;

const barCurrentDto = z.number().int().min(-BAR_VALUE_LIMIT).max(BAR_VALUE_LIMIT);
const barMaxDto = z.number().int().min(1).max(BAR_VALUE_LIMIT);

/** A number in steps of half a cell from `min` to `max`, refused citing `noun` and the value.
 *
 *  Example: `halfCellDto('width', 0.5, 10).parse(2.5)` → `2.5` */
export function halfCellDto(noun: string, min: number, max: number) {
  return z.number().superRefine((value, context) => {
    if (Number.isInteger(value * 2) && value >= min && value <= max) return;
    context.addIssue({
      code: 'custom',
      message: `${noun} ${value} is invalid; expected a multiple of 0.5 from ${min} to ${max}`,
    });
  });
}

/** A token position on the grid: half cells allowed, so a 0.5 token stands at 1.5. */
export const cellIndexDto = halfCellDto('cell', 0, Number.MAX_SAFE_INTEGER);
export const tokenSideLengthDto = halfCellDto('token side', TOKEN_SIZE_MIN, TOKEN_SIZE_MAX);

/** A bar as the master writes it (create or edit); its position is its index in the list. */
export const barInputDto = z.strictObject({
  label: z.string().trim().min(1).max(BAR_LABEL_MAX_LENGTH),
  current: barCurrentDto,
  max: barMaxDto,
  color: barColorDto,
  visibility: barVisibilityDto,
  display: barDisplayDto.default('number'),
});
export type BarInputDto = z.infer<typeof barInputDto>;

/** A bar as a viewer receives it; `position` 0 is the one drawn on the token. */
export const tokenBarDto = barInputDto.extend({
  id: z.uuid(),
  position: z
    .number()
    .int()
    .min(0)
    .max(MAX_BARS_PER_TOKEN - 1),
});
export type TokenBarDto = z.infer<typeof tokenBarDto>;

const tokenFieldsShape = {
  name: z.string().trim().min(1).max(TOKEN_NAME_MAX_LENGTH),
  initials: z.string().trim().min(1).max(TOKEN_INITIALS_MAX_LENGTH),
  side: tokenSideDto,
  width: tokenSideLengthDto,
  height: tokenSideLengthDto,
  controllerIds: z.array(z.uuid()).max(32),
};

/** A token as one viewer may see it: redacted bars are simply absent, and `canControl` is the
 *  server's answer to "may this viewer move it and touch its bars". `light` (`null` = emits none)
 *  and `lightLit` are the same for everyone: the client needs them for the fog.
 *
 *  Example: `tokenDto.parse(event.token).bars[0]?.position // 0 when the first bar is visible` */
export const tokenDto = z.strictObject({
  id: z.uuid(),
  ...tokenFieldsShape,
  col: cellIndexDto,
  row: cellIndexDto,
  layer: tokenLayerDto,
  ...tokenAppearanceShape,
  facing: facingDto,
  sightAngle: coneAngleDto('sight'),
  sight: sightDto.nullable(),
  light: tokenLightDto.nullable(),
  lightLit: z.boolean(),
  /** The aura around it (`null` = none); like the look, every audience gets the same one. */
  aura: tokenAuraDto.nullable(),
  /** Hidden from the players: only the masters and its controllers ever receive it. */
  hidden: z.boolean(),
  canControl: z.boolean(),
  bars: z.array(tokenBarDto).max(MAX_BARS_PER_TOKEN),
  conditions: z.array(activeConditionDto),
  /** The anchor of the character this token is linked to (in the table's cast), or `null`. A
   *  linked token already comes with the anchor's name, initials, side, image, frame, defeat
   *  mark, bars, controllers and conditions; place, size, layer, facing, flips, sight and light
   *  are its own. */
  anchorTokenId: z.uuid().nullable(),
});
export type TokenDto = z.infer<typeof tokenDto>;

/** `token:create` (master); without a `layer` the token lands on `tokens`, and without appearance
 *  it is the initials disc looking right (a paste sends the copied look and facing).
 *
 *  Example: `createTokenCommandDto.parse({ actionId, campaignId, name, …, layer: 'objects' })` */
export const createTokenCommandDto = z.strictObject({
  ...boardCommandShape,
  ...tokenFieldsShape,
  col: cellIndexDto,
  row: cellIndexDto,
  layer: tokenLayerDto.default('tokens'),
  imageAssetId: tokenAppearanceShape.imageAssetId.default(null),
  frame: tokenFrameDto.default('square'),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
  facing: facingDto.default(0),
  sightAngle: coneAngleDto('sight').default(360),
  sight: sightDto.nullable().optional(),
  light: tokenLightDto.nullable().optional(),
  aura: tokenAuraDto.nullable().default(null),
  bars: z.array(barInputDto).max(MAX_BARS_PER_TOKEN),
});
export type CreateTokenCommandDto = z.infer<typeof createTokenCommandDto>;
export type CreateTokenCommandInput = z.input<typeof createTokenCommandDto>;

/** `token:update` (master): everything but the position and the facing; the bars are replaced as a
 *  list, and an absent appearance field keeps what the token has. */
export const updateTokenCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  ...tokenFieldsShape,
  imageAssetId: tokenAppearanceShape.imageAssetId.optional(),
  frame: tokenFrameDto.optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  sightAngle: coneAngleDto('sight').optional(),
  sight: sightDto.nullable().optional(),
  light: tokenLightDto.nullable().optional(),
  aura: tokenAuraDto.nullable().optional(),
  bars: z.array(barInputDto).max(MAX_BARS_PER_TOKEN),
});
export type UpdateTokenCommandDto = z.infer<typeof updateTokenCommandDto>;

/** The bends of a drag between origin and destination, in token cells: the server checks the
 *  walls on each leg. Without it, the move is a straight line.
 *
 *  Example: `movePathDto.parse([{ col: 1, row: 10 }])` */
export const movePathDto = z
  .array(z.strictObject({ col: cellIndexDto, row: cellIndexDto }))
  .superRefine((bends, context) => {
    if (bends.length <= MOVE_PATH_MAX) return;
    context.addIssue({
      code: 'custom',
      message: `path has ${bends.length} bends; expected at most ${MOVE_PATH_MAX}`,
    });
  });
export type MovePathDto = z.infer<typeof movePathDto>;

/** `token:move` (master or a controller); `path` lists the bends around walls. */
export const moveTokenCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  col: cellIndexDto,
  row: cellIndexDto,
  path: movePathDto.optional(),
});
export type MoveTokenCommandDto = z.infer<typeof moveTokenCommandDto>;

/** The cell a token is dragged over, or `null` when its drag ended without a move. */
export const draggedCellDto = z.strictObject({ col: cellIndexDto, row: cellIndexDto }).nullable();

/** "−7" subtracts, "+5" adds, "12" sets (the field is parsed on the client); `max` is the
 *  "Máx." field of the card, a new maximum that leaves the current alone. */
export const barChangeDto = z.discriminatedUnion('op', [
  z.strictObject({
    op: z.literal('add'),
    amount: z
      .number()
      .int()
      .min(-2 * BAR_VALUE_LIMIT)
      .max(2 * BAR_VALUE_LIMIT),
  }),
  z.strictObject({ op: z.literal('set'), value: barCurrentDto }),
  z.strictObject({ op: z.literal('max'), value: barMaxDto }),
]);
export type BarChangeDto = z.infer<typeof barChangeDto>;

/** `token:adjustBar` (master or a controller). */
export const adjustBarCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  barId: z.uuid(),
  change: barChangeDto,
});
export type AdjustBarCommandDto = z.infer<typeof adjustBarCommandDto>;

/** `token:delete` (master). */
export const deleteTokenCommandDto = z.strictObject({ ...boardCommandShape, tokenId: z.uuid() });
export type DeleteTokenCommandDto = z.infer<typeof deleteTokenCommandDto>;

export const tokenCreatedDto = z.strictObject({ ...boardEventShape, token: tokenDto });
export type TokenCreatedDto = z.infer<typeof tokenCreatedDto>;

export const tokenUpdatedDto = z.strictObject({ ...boardEventShape, token: tokenDto });
export type TokenUpdatedDto = z.infer<typeof tokenUpdatedDto>;

export const tokenMovedDto = z.strictObject({
  ...boardEventShape,
  tokenId: z.uuid(),
  col: cellIndexDto,
  row: cellIndexDto,
});
export type TokenMovedDto = z.infer<typeof tokenMovedDto>;

/** `combat` is the combat after the token left it (the turn may have passed), or `null` with none. */
export const tokenDeletedDto = z.strictObject({
  ...boardEventShape,
  tokenId: z.uuid(),
  combat: combatDto.nullable(),
});
export type TokenDeletedDto = z.infer<typeof tokenDeletedDto>;
