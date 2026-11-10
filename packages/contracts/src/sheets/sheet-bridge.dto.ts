import { z } from 'zod';
import {
  barChangeDto,
  MAX_BARS_PER_TOKEN,
  TOKEN_NAME_MAX_LENGTH,
  tokenBarDto,
} from '../board/token.dto';
import { ASSET_MAX_BYTES, assetMimeTypeDto } from '../assets/asset.dto';
import { CHARACTER_NAME_MAX } from '../board/character.dto';
import { characterStatDto } from '../board/character-fields.dto';
import { diceRollLabelDto, diceRollPartDto, diceVisibilityDto } from '../dice/dice.dto';
import { sheetBarCostDto } from './sheet.dto';
import { sheetValuePathPatchesDto, sheetValuesDto, sheetValuesPatchDto } from './sheet-values.dto';

export const SHEET_BRIDGE_REQUEST_ID_MAX_LENGTH = 64;
export const SHEET_BRIDGE_ERROR_MESSAGE_MAX_LENGTH = 500;
/** The longest bar reference (`bars.adjust`'s name or id) the frame may send. */
export const SHEET_BRIDGE_BAR_REFERENCE_MAX_LENGTH = 64;

/** Chosen by the frame's SDK (a counter is enough): it only pairs a `result`/`error` with its
 *  request, so it never needs to be unique beyond one frame. */
export const sheetBridgeRequestIdDto = z
  .string()
  .regex(new RegExp(`^[A-Za-z0-9_-]{1,${SHEET_BRIDGE_REQUEST_ID_MAX_LENGTH}}$`));

const requestShape = { requestId: sheetBridgeRequestIdDto };

/** What a line of the sheet's console says it is (`console.debug` keeps its own level). */
export const SHEET_CONSOLE_LEVELS = ['log', 'info', 'warn', 'error', 'debug'] as const;
export const sheetConsoleLevelDto = z.enum(SHEET_CONSOLE_LEVELS);
export type SheetConsoleLevelDto = z.infer<typeof sheetConsoleLevelDto>;
/** The longest text of one console line; the frame cuts longer ones before sending. */
export const SHEET_CONSOLE_MESSAGE_MAX_LENGTH = 2000;
/** How many srcdoc positions (the error's stack, top first) one line may carry. */
export const SHEET_CONSOLE_POSITIONS_MAX = 8;
const SRCDOC_POSITION_MAX = 10_000_000;

/** A line and column of the frame's srcdoc (1-based line, as the browser reports it). */
export const sheetConsolePositionDto = z.strictObject({
  line: z.int().min(1).max(SRCDOC_POSITION_MAX),
  column: z.int().min(0).max(SRCDOC_POSITION_MAX),
});
export type SheetConsolePositionDto = z.infer<typeof sheetConsolePositionDto>;

const consoleShapes = [
  z.strictObject({
    type: z.literal('console'),
    level: sheetConsoleLevelDto,
    message: z.string().max(SHEET_CONSOLE_MESSAGE_MAX_LENGTH),
    at: z.array(sheetConsolePositionDto).max(SHEET_CONSOLE_POSITIONS_MAX),
  }),
  z.strictObject({ type: z.literal('console.dropped'), count: z.int().min(1).max(1_000_000_000) }),
] as const;

function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]';
}

// The frame's realm has its own ArrayBuffer, so `instanceof` would refuse a cloned buffer.
const arrayBufferDto = z.custom<ArrayBuffer>(isArrayBuffer).superRefine((bytes, context) => {
  if (bytes.byteLength <= ASSET_MAX_BYTES) return;
  context.addIssue({
    code: 'custom',
    message: `image has ${bytes.byteLength} bytes; expected at most ${ASSET_MAX_BYTES}`,
  });
});

/** Image bytes and their type, as they cross the port either way (no URL: an opaque origin has
 *  no cookie). */
export const sheetFrameImageDto = z.strictObject({ type: assetMimeTypeDto, bytes: arrayBufferDto });
export type SheetFrameImageDto = z.infer<typeof sheetFrameImageDto>;

// GIF is kept only for an aura: neither a portrait nor a sheet image takes it.
const uploadImageDto = z.strictObject({
  type: assetMimeTypeDto.exclude(['image/gif']),
  bytes: arrayBufferDto,
});

const characterStatsFields = ['armorClass', 'difficultyClass'] as const;

/** The card numbers a sheet writes (`character.set`): AC and DC only, a whole number each. */
const characterStatsChangesDto = z
  .strictObject({
    armorClass: characterStatDto('armorClass').unwrap().optional(),
    difficultyClass: characterStatDto('difficultyClass').unwrap().optional(),
  })
  .refine(
    (changes) => characterStatsFields.some((field) => changes[field] !== undefined),
    `changes is empty; expected at least one of ${characterStatsFields.join(', ')}`,
  );

const barReferenceDto = z.string().min(1).max(SHEET_BRIDGE_BAR_REFERENCE_MAX_LENGTH);

/** Frame → host, over the `MessagePort`. No `tokenId`, `campaignId` or `sheetId`: the host
 *  knows which sheet the frame is and the server resolves the token. `bars.adjust` names the bar
 *  by its id or by its label (the host resolves it to the id the server takes). `console` and
 *  `console.dropped` carry the frame's console (no `requestId`: the host never answers them).
 *
 *  Example: `sheetFrameMessageDto.parse({ type: 'bars.adjust', requestId: '3', bar: 'PV', change: { op: 'add', amount: -5 } })` */
export const sheetFrameMessageDto = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), ...requestShape }),
  z.strictObject({
    type: z.literal('bars.adjust'),
    ...requestShape,
    bar: barReferenceDto,
    change: barChangeDto,
  }),
  z.strictObject({
    type: z.literal('bars.spend'),
    ...requestShape,
    costs: z
      .array(z.strictObject({ bar: barReferenceDto, amount: sheetBarCostDto.shape.amount }))
      .min(1)
      .max(MAX_BARS_PER_TOKEN),
  }),
  z.strictObject({
    type: z.literal('dice.roll'),
    ...requestShape,
    expression: diceRollPartDto.shape.expression,
    label: diceRollLabelDto.optional(),
    visibility: diceVisibilityDto.default('public'),
  }),
  z.strictObject({ type: z.literal('values.set'), ...requestShape, changes: sheetValuesPatchDto }),
  z.strictObject({
    type: z.literal('values.patch'),
    ...requestShape,
    patches: sheetValuePathPatchesDto,
  }),
  z.strictObject({
    type: z.literal('character.set'),
    ...requestShape,
    changes: characterStatsChangesDto,
  }),
  z.strictObject({ type: z.literal('character.setImage'), ...requestShape, image: uploadImageDto }),
  z.strictObject({ type: z.literal('assets.upload'), ...requestShape, image: uploadImageDto }),
  z.strictObject({ type: z.literal('assets.read'), ...requestShape, assetId: z.uuid() }),
  ...consoleShapes,
]);
export type SheetFrameMessageDto = z.infer<typeof sheetFrameMessageDto>;
/** A console line (or the count of lines the frame dropped), with no answer from the host. */
export type SheetConsoleMessageDto = Extract<
  SheetFrameMessageDto,
  { type: 'console' | 'console.dropped' }
>;
/** A frame message the host answers with `result` or `error`. */
export type SheetFrameRequestDto = Exclude<SheetFrameMessageDto, SheetConsoleMessageDto>;
export type SheetFrameMessageInput = z.input<typeof sheetFrameMessageDto>;

/** The token as the frame sees it: name and the image bytes (the frame makes its own `blob:` URL,
 *  since the session cookie never leaves an opaque origin). */
export const sheetFrameTokenDto = z.strictObject({
  name: z.string().trim().min(1).max(TOKEN_NAME_MAX_LENGTH),
  image: sheetFrameImageDto.nullable(),
});
export type SheetFrameTokenDto = z.infer<typeof sheetFrameTokenDto>;

/** The character that holds the sheet as the frame sees it: no id (the host acts on it). */
export const sheetFrameCharacterDto = z.strictObject({
  name: z.string().trim().min(1).max(CHARACTER_NAME_MAX),
  armorClass: characterStatDto('armorClass'),
  difficultyClass: characterStatDto('difficultyClass'),
});
export type SheetFrameCharacterDto = z.infer<typeof sheetFrameCharacterDto>;

/** What a `result` carries back: the new asset (`assets.upload`) or the bytes (`assets.read`). */
export const sheetBridgeResultValueDto = z.union([
  z.strictObject({ assetId: z.uuid() }),
  sheetFrameImageDto,
]);
export type SheetBridgeResultValueDto = z.infer<typeof sheetBridgeResultValueDto>;

/** Host → frame. `state` is resent whenever the token or the values change; `bars` are the
 *  viewer's own (already redacted by the server); `token` is `null` (with no bars) for a sheet
 *  with no holder; `character` is `null` but for a character's sheet; `result.value` only answers
 *  the requests that return something; `error.requestId` is `null` when the frame's message could
 *  not even be read.
 *
 *  Example: `sheetHostMessageDto.parse({ type: 'error', requestId: '3', code: 'RATE_LIMITED', message: 'Too many rolls' })` */
export const sheetHostMessageDto = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('state'),
    token: sheetFrameTokenDto.nullable(),
    bars: z.array(tokenBarDto).max(MAX_BARS_PER_TOKEN),
    values: sheetValuesDto,
    canEdit: z.boolean(),
    character: sheetFrameCharacterDto.nullable(),
  }),
  z.strictObject({
    type: z.literal('result'),
    ...requestShape,
    value: sheetBridgeResultValueDto.optional(),
  }),
  z.strictObject({
    type: z.literal('error'),
    requestId: sheetBridgeRequestIdDto.nullable(),
    code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
    message: z.string().max(SHEET_BRIDGE_ERROR_MESSAGE_MAX_LENGTH),
  }),
]);
export type SheetHostMessageDto = z.infer<typeof sheetHostMessageDto>;
export type SheetHostMessageInput = z.input<typeof sheetHostMessageDto>;
