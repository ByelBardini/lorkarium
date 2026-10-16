import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { combatDto } from './combat.dto';
import { activeConditionDto } from './condition.dto';

export const MAX_BARS_PER_TOKEN = 8;
/** The bar values stop at ±this (current) and the maximum goes up to it. */
export const BAR_VALUE_LIMIT = 99_999;
export const TOKEN_NAME_MAX_LENGTH = 60;
export const TOKEN_INITIALS_MAX_LENGTH = 3;
export const BAR_LABEL_MAX_LENGTH = 24;
export const TOKEN_SIZE_MAX = 4;

export const tokenSideDto = z.enum(['ally', 'enemy', 'neutral']);
export type TokenSideDto = z.infer<typeof tokenSideDto>;

/** The five bar colors of the design system (`chart-1..4` and ash), never a free hex. */
export const barColorDto = z.enum(['gold', 'steel', 'ember', 'moss', 'ash']);
export type BarColorDto = z.infer<typeof barColorDto>;

/** "Todos veem" or "Só mestre e quem controla": the server omits a `controllers` bar for others. */
export const barVisibilityDto = z.enum(['everyone', 'controllers']);
export type BarVisibilityDto = z.infer<typeof barVisibilityDto>;

const barCurrentDto = z.number().int().min(-BAR_VALUE_LIMIT).max(BAR_VALUE_LIMIT);
const cellIndexDto = z.number().int().nonnegative();

/** A bar as the master writes it (create or edit); its position is its index in the list. */
export const barInputDto = z.strictObject({
  label: z.string().trim().min(1).max(BAR_LABEL_MAX_LENGTH),
  current: barCurrentDto,
  max: z.number().int().min(1).max(BAR_VALUE_LIMIT),
  color: barColorDto,
  visibility: barVisibilityDto,
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
  size: z.number().int().min(1).max(TOKEN_SIZE_MAX),
  controllerIds: z.array(z.uuid()).max(32),
};

/** A token as one viewer may see it: redacted bars are simply absent, and `canControl` is the
 *  server's answer to "may this viewer move it and touch its bars".
 *
 *  Example: `tokenDto.parse(event.token).bars[0]?.position // 0 when the first bar is visible` */
export const tokenDto = z.strictObject({
  id: z.uuid(),
  ...tokenFieldsShape,
  col: cellIndexDto,
  row: cellIndexDto,
  canControl: z.boolean(),
  bars: z.array(tokenBarDto).max(MAX_BARS_PER_TOKEN),
  conditions: z.array(activeConditionDto),
});
export type TokenDto = z.infer<typeof tokenDto>;

/** `token:create` (master). Example: `createTokenCommandDto.parse({ actionId, campaignId, name, … })` */
export const createTokenCommandDto = z.strictObject({
  ...boardCommandShape,
  ...tokenFieldsShape,
  col: cellIndexDto,
  row: cellIndexDto,
  bars: z.array(barInputDto).max(MAX_BARS_PER_TOKEN),
});
export type CreateTokenCommandDto = z.infer<typeof createTokenCommandDto>;
export type CreateTokenCommandInput = z.input<typeof createTokenCommandDto>;

/** `token:update` (master): everything but the position; the bars are replaced as a list. */
export const updateTokenCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  ...tokenFieldsShape,
  bars: z.array(barInputDto).max(MAX_BARS_PER_TOKEN),
});
export type UpdateTokenCommandDto = z.infer<typeof updateTokenCommandDto>;

/** `token:move` (master or a controller). */
export const moveTokenCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  col: cellIndexDto,
  row: cellIndexDto,
});
export type MoveTokenCommandDto = z.infer<typeof moveTokenCommandDto>;

const draggedCellDto = z.strictObject({ col: cellIndexDto, row: cellIndexDto }).nullable();

/** `token:drag` (master or a controller): the cell a token is being dragged over, before it is
 *  dropped; `null` when the drag ended without a move. Nothing is saved and the version stays.
 *
 *  Example: `dragTokenCommandDto.parse({ actionId, campaignId, tokenId, cell: { col: 4, row: 2 } })` */
export const dragTokenCommandDto = z.strictObject({
  ...boardCommandShape,
  tokenId: z.uuid(),
  cell: draggedCellDto,
});
export type DragTokenCommandDto = z.infer<typeof dragTokenCommandDto>;

/** "−7" subtracts, "+5" adds, "12" sets (the field is parsed on the client). */
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

/** `token:dragged`: a preview, not a confirmed change, so it carries no version (§5.5 covers the
 *  confirmed `token:moved` that ends the drag). `cell: null` puts the token back where it is.
 *
 *  Example: `tokenDraggedDto.parse(payload).cell // { col: 4, row: 2 } | null` */
export const tokenDraggedDto = z.strictObject({
  campaignId: z.uuid(),
  at: z.iso.datetime(),
  tokenId: z.uuid(),
  cell: draggedCellDto,
});
export type TokenDraggedDto = z.infer<typeof tokenDraggedDto>;

/** `combat` is the combat after the token left it (the turn may have passed), or `null` with none. */
export const tokenDeletedDto = z.strictObject({
  ...boardEventShape,
  tokenId: z.uuid(),
  combat: combatDto.nullable(),
});
export type TokenDeletedDto = z.infer<typeof tokenDeletedDto>;
