import { z } from 'zod';
import { diceNumberColorDto } from '../account/dice-texture.dto';
import { memberColorDto } from '../account/username.dto';
import { realtimeAckFailureDto } from '../http/realtime-ack.dto';

export const DICE_EVENTS = {
  roll: 'dice:roll',
  rolled: 'dice:rolled',
  rolledSecretly: 'dice:rolledSecretly',
} as const;

/** Parts of one roll; repeats the composition ceiling of the game-core's `parseDiceParts`. */
export const DICE_ROLL_PARTS_MAX = 10;
/** Repeats `DICE_LIMITS.maxLength` of the game-core (contracts depends only on zod). */
export const DICE_EXPRESSION_MAX_LENGTH = 200;
/** The same ceiling as a saved roll's name, so a saved roll's name fits as the roll label. */
export const DICE_ROLL_LABEL_MAX_LENGTH = 40;
/** Width / height of the physics box: the roller's window, clamped. */
export const DICE_ASPECT_MIN = 0.5;
export const DICE_ASPECT_MAX = 3;
/** Dice with a 3D model in one roll (a d100 counts as 2 models). */
export const DICE_THROW_MODELS_MAX = 20;

// Repeat `DICE_POSE_STRIDE`, `DICE_POSITION_LIMIT × DICE_POSITION_SCALE` and
// `DICE_QUATERNION_SCALE` of the game-core's `dice-frames.ts`.
const POSE_STRIDE = 7;
const POSITION_INTEGER_MAX = 32000;
const QUATERNION_INTEGER_MAX = 32767;

/** Who sees the result: the whole table, or only the masters (and the roller). */
export const diceVisibilityDto = z.enum(['public', 'masters']);
export type DiceVisibilityDto = z.infer<typeof diceVisibilityDto>;

/** A roll or part label: trimmed, up to 40 characters; blank becomes `null`.
 *
 *  Example: `diceRollLabelDto.parse('   ') // null` */
export const diceRollLabelDto = z
  .string()
  .trim()
  .max(DICE_ROLL_LABEL_MAX_LENGTH)
  .transform((label) => (label === '' ? null : label))
  .nullable();

/** One piece of the tray: a free expression ("1d20+5") or a saved roll by its label.
 *  The notation itself is read by the game-core on the server.
 *
 *  Example: `diceRollPartDto.parse({ label: null, expression: ' 1d20+5 ' }).expression // '1d20+5'` */
export const diceRollPartDto = z.strictObject({
  label: diceRollLabelDto,
  expression: z.string().trim().min(1).max(DICE_EXPRESSION_MAX_LENGTH),
});
export type DiceRollPartDto = z.infer<typeof diceRollPartDto>;
export type DiceRollPartInput = z.input<typeof diceRollPartDto>;

/** `dice:roll`: who rolls comes from the connection, never from here (§7.3). `aspect` is the
 *  roller's window, the shape of the physics box everyone replays.
 *
 *  Example: `diceRollCommandDto.parse({ actionId, campaignId, label: null, parts, visibility: 'public', aspect: 1.78 })` */
export const diceRollCommandDto = z.strictObject({
  actionId: z.uuid(),
  campaignId: z.uuid(),
  label: diceRollLabelDto,
  parts: z.array(diceRollPartDto).min(1).max(DICE_ROLL_PARTS_MAX),
  visibility: diceVisibilityDto,
  aspect: z.number().min(DICE_ASPECT_MIN).max(DICE_ASPECT_MAX),
});
export type DiceRollCommandDto = z.infer<typeof diceRollCommandDto>;
export type DiceRollCommandInput = z.input<typeof diceRollCommandDto>;

/** Answer to `dice:roll`: the id of the roll (its events carry the same) or the API error.
 *
 *  Example: `diceRollAckDto.parse(answer).ok` */
export const diceRollAckDto = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), rollId: z.uuid() }),
  realtimeAckFailureDto,
]);
export type DiceRollAckDto = z.infer<typeof diceRollAckDto>;

/** The dice with a 3D shape; repeats `DIE_KINDS` of the game-core. A d100 is a `d100tens` + a `d10`. */
export const dieKindDto = z.enum(['d4', 'd6', 'd8', 'd10', 'd100tens', 'd12', 'd20']);
export type DieKindDto = z.infer<typeof dieKindDto>;

function frameIntegerMax(index: number): number {
  return index % POSE_STRIDE < 3 ? POSITION_INTEGER_MAX : QUATERNION_INTEGER_MAX;
}

/** The recorded poses of one die, 7 integers each (x, y, z in thousandths, quaternion × 32767),
 *  as `encodeDiceFrames` of the game-core packs them. */
const diceFramesDto = z.array(z.number().int()).superRefine((frames, context) => {
  if (frames.length === 0 || frames.length % POSE_STRIDE !== 0) {
    context.addIssue({
      code: 'custom',
      message: `dice frames have ${frames.length} integers; expected a multiple of ${POSE_STRIDE}, at least ${POSE_STRIDE}`,
    });
    return;
  }
  const outside = frames.findIndex((value, index) => Math.abs(value) > frameIntegerMax(index));
  if (outside < 0) return;
  context.addIssue({
    code: 'custom',
    message: `dice frame integer ${outside} is ${frames[outside]}; expected −${frameIntegerMax(outside)} to ${frameIntegerMax(outside)}`,
  });
});

/** One modeled die of the throw. `startMs` and `settleMs` count from the roll's start: a wave of
 *  explosions starts after the previous one settles. */
export const diceThrowModelDto = z
  .strictObject({
    kind: dieKindDto,
    startMs: z.number().nonnegative(),
    settleMs: z.number().nonnegative(),
    frames: diceFramesDto,
  })
  .superRefine((model, context) => {
    if (model.settleMs >= model.startMs) return;
    context.addIssue({
      code: 'custom',
      message: `die model settleMs ${model.settleMs} is before startMs ${model.startMs}; expected settleMs ≥ startMs`,
    });
  });
export type DiceThrowModelDto = z.infer<typeof diceThrowModelDto>;

/** The recorded throw everyone with 3D on replays. Absent (`null` on the event) when no die of
 *  the roll has a model.
 *
 *  Example: `diceThrowDto.parse({ aspect: 1.78, frameMs: 1000 / 30, models })` */
export const diceThrowDto = z.strictObject({
  aspect: z.number().min(DICE_ASPECT_MIN).max(DICE_ASPECT_MAX),
  frameMs: z.number().positive(),
  models: z.array(diceThrowModelDto).min(1).max(DICE_THROW_MODELS_MAX),
});
export type DiceThrowDto = z.infer<typeof diceThrowDto>;

/** How the roller's dice look: the profile color, the texture (`null` = the color) and the
 *  number color (`null` = automatic contrast, or white over a texture). */
export const diceAppearanceDto = z.strictObject({
  color: memberColorDto,
  textureId: z.uuid().nullable(),
  numberColor: diceNumberColorDto.nullable(),
});
export type DiceAppearanceDto = z.infer<typeof diceAppearanceDto>;

/** `rerolled` was replaced and does not count; `dropped` lost the keep/drop; `exploded` counts
 *  and spawned another die; `kept` counts. The game-core's `DieStatus`. */
export const dieStatusDto = z.enum(['kept', 'dropped', 'exploded', 'rerolled']);
export type DieStatusDto = z.infer<typeof dieStatusDto>;

/** One die of the result. `success` only on a counted die of a term with `>=`/`<=`; `model` are
 *  the indices in `throw.models` that show it (two for a d100: tens, then units; absent when the
 *  die has no 3D model). */
export const rolledDieDto = z
  .strictObject({
    sides: z.number().int().min(2).max(1000),
    value: z.number().int().min(1),
    status: dieStatusDto,
    success: z.boolean().optional(),
    model: z.array(z.number().int().nonnegative()).min(1).max(2).optional(),
  })
  .superRefine((die, context) => {
    if (die.value <= die.sides) return;
    context.addIssue({
      code: 'custom',
      message: `die value ${die.value} is invalid; expected 1 to ${die.sides}`,
    });
  });
export type RolledDieDto = z.infer<typeof rolledDieDto>;

/** One part of the result: the part as rolled, its total and its dice in throw order. */
export const rolledPartDto = z.strictObject({
  ...diceRollPartDto.shape,
  total: z.number().int(),
  dice: z.array(rolledDieDto),
});
export type RolledPartDto = z.infer<typeof rolledPartDto>;

/** `dice:rolled`: the full roll, to whoever may see it (the table, or the masters and the roller).
 *  No `version`: nothing is saved. `settlesInMs` is how long after receipt the result shows.
 *
 *  Example: `diceRolledDto.safeParse(payload).success` */
export const diceRolledDto = z
  .strictObject({
    campaignId: z.uuid(),
    rollId: z.uuid(),
    rollerId: z.uuid(),
    visibility: diceVisibilityDto,
    label: diceRollLabelDto,
    parts: z.array(rolledPartDto).min(1).max(DICE_ROLL_PARTS_MAX),
    total: z.number().int(),
    appearance: diceAppearanceDto,
    throw: diceThrowDto.nullable(),
    settlesInMs: z.number().nonnegative(),
    at: z.iso.datetime(),
  })
  .superRefine((event, context) => {
    const modelCount = event.throw?.models.length ?? 0;
    const indices = event.parts.flatMap((part) => part.dice.flatMap((die) => die.model ?? []));
    const missing = indices.find((index) => index >= modelCount);
    if (missing === undefined) return;
    context.addIssue({
      code: 'custom',
      message: `die model ${missing} is invalid; expected an index below ${modelCount} throw models`,
    });
  });
export type DiceRolledDto = z.infer<typeof diceRolledDto>;

/** `dice:rolledSecretly`: to everyone who may not see a masters-only roll. No total, label, parts
 *  nor throw (the final pose would reveal the face).
 *
 *  Example: `diceRolledSecretlyDto.parse({ campaignId, rollId, rollerId, settlesInMs: 800, at })` */
export const diceRolledSecretlyDto = z.strictObject({
  campaignId: z.uuid(),
  rollId: z.uuid(),
  rollerId: z.uuid(),
  settlesInMs: z.number().nonnegative(),
  at: z.iso.datetime(),
});
export type DiceRolledSecretlyDto = z.infer<typeof diceRolledSecretlyDto>;

/** Client → server dice events, for the Socket.IO generics on both ends. */
export type DiceClientEvents = {
  'dice:roll': (command: DiceRollCommandDto, ack: (answer: DiceRollAckDto) => void) => void;
};

/** Server → client dice events. */
export type DiceServerEvents = {
  'dice:rolled': (event: DiceRolledDto) => void;
  'dice:rolledSecretly': (event: DiceRolledSecretlyDto) => void;
};
