import { z } from 'zod';
import { boardCommandShape, boardEventShape } from './board-event.dto';
import { REACH_MAX, reachSideDto } from './reach.dto';
import { SCENE_CELLS_MAX } from './scene.dto';
import { idGroupOf, strayExpectation, TOKEN_GROUP_MAX } from './token-id-group.dto';

/** The longest bright or dim light, in cells (game-core `LIGHT_RANGE_MAX`). */
export const LIGHT_RANGE_MAX = REACH_MAX;
/** Map lights one scene keeps (conferred on the server). */
export const LIGHTS_PER_SCENE_MAX = 100;

const rangeShape = { bright: reachSideDto('light', 'bright'), dim: reachSideDto('light', 'dim') };

/** How far a light shines, in cells: fully up to `bright`, then `dim` more of half-light
 *  (game-core `lightRange`, rewritten because contracts depends only on zod).
 *
 *  Example: `lightRangeDto.parse({ bright: 4, dim: 4 })` (a torch) */
export const lightRangeDto = z.strictObject(rangeShape);
export type LightRangeDto = z.infer<typeof lightRangeDto>;

/** The light palette, by name (the client keeps the tones). A neutral light is `color: null`. */
export const LIGHT_COLORS = [
  'torch',
  'candle',
  'fire',
  'moon',
  'arcane',
  'necrotic',
  'infernal',
] as const;

/** The color a light tints what it shines on, by palette name, never a free hex.
 *
 *  Example: `lightColorDto.parse('infernal')` */
export const lightColorDto = z.enum(LIGHT_COLORS);
export type LightColorDto = z.infer<typeof lightColorDto>;

/** The light a token gives off: its range and its color (absent is neutral). Only the master sets
 *  it; whoever controls the token only lights and puts it out (`lightLit`).
 *
 *  Example: `tokenLightDto.parse({ bright: 4, dim: 4, color: 'torch' })` */
export const tokenLightDto = lightRangeDto.extend({
  color: lightColorDto.nullable().default(null),
});
export type TokenLightDto = z.infer<typeof tokenLightDto>;

const cellCoordinateDto = z.number().min(0).max(SCENE_CELLS_MAX);
const pointShape = { x: cellCoordinateDto, y: cellCoordinateDto };

/** A map light as the master places it: a point in fractional cells, its range and its color
 *  (absent is neutral). It is born lit.
 *
 *  Example: `lightPlacementDto.parse({ x: 5.5, y: 3, bright: 4, dim: 4, color: 'fire' })` */
export const lightPlacementDto = z.strictObject({
  ...pointShape,
  ...rangeShape,
  color: lightColorDto.nullable().default(null),
});
export type LightPlacementDto = z.infer<typeof lightPlacementDto>;

/** A confirmed map light, the same for every audience: the player's client needs it for the fog
 *  (only the master's board draws the icon). */
export const lightDto = z.strictObject({
  id: z.uuid(),
  ...pointShape,
  ...rangeShape,
  lit: z.boolean(),
  color: lightColorDto.nullable(),
});
export type LightDto = z.infer<typeof lightDto>;

const lightAtDto = z.strictObject({ lightId: z.uuid(), ...pointShape });
export type LightAtDto = z.infer<typeof lightAtDto>;

const lightMoveDto = lightAtDto.extend({ expect: z.strictObject(pointShape).optional() });
export type LightMoveDto = z.infer<typeof lightMoveDto>;

const lightRangeOfDto = z.strictObject({ lightId: z.uuid(), ...rangeShape });
export type LightRangeOfDto = z.infer<typeof lightRangeOfDto>;

const lightRangeChangeDto = lightRangeOfDto.extend({ expect: lightRangeDto.optional() });
export type LightRangeChangeDto = z.infer<typeof lightRangeChangeDto>;

const lightColorShape = { color: lightColorDto.nullable() };

const lightColorOfDto = z.strictObject({ lightId: z.uuid(), ...lightColorShape });
export type LightColorOfDto = z.infer<typeof lightColorOfDto>;

const lightColorChangeDto = lightColorOfDto.extend({
  expect: z.strictObject(lightColorShape).optional(),
});
export type LightColorChangeDto = z.infer<typeof lightColorChangeDto>;

const lightIdGroupDto = idGroupOf(z.uuid(), (lightId) => lightId, 'light');

function strayDeleteCheck(
  command: { lightIds: string[]; expect?: { lightId: string }[] | undefined },
  context: z.RefinementCtx,
): void {
  const expected = (command.expect ?? []).map(({ lightId }) => lightId);
  const stray = strayExpectation(command.lightIds, expected);
  if (stray === undefined) return;
  context.addIssue({
    code: 'custom',
    message: `light ${stray} is not being deleted; expected only ids in lightIds`,
  });
}

/** `light:createMany` (master): 1 to 64 lights, all or nothing, one version; the ack names the
 *  ids given (`createdIds`).
 *
 *  Example: `createLightsCommandDto.parse({ actionId, campaignId, lights: [{ x: 5.5, y: 3, bright: 4, dim: 4 }] })` */
export const createLightsCommandDto = z.strictObject({
  ...boardCommandShape,
  lights: z.array(lightPlacementDto).min(1).max(TOKEN_GROUP_MAX),
});
export type CreateLightsCommandDto = z.infer<typeof createLightsCommandDto>;

/** `light:moveMany` (master); `expect` is where the light must still be (the undo precondition).
 *
 *  Example: `moveLightsCommandDto.parse({ actionId, campaignId, moves: [{ lightId, x: 6, y: 3 }] })` */
export const moveLightsCommandDto = z.strictObject({
  ...boardCommandShape,
  moves: idGroupOf(lightMoveDto, (move) => move.lightId, 'light'),
});
export type MoveLightsCommandDto = z.infer<typeof moveLightsCommandDto>;

/** `light:setRangeMany` (master); `expect` is the range the light must still have (undo).
 *
 *  Example: `setLightRangesCommandDto.parse({ actionId, campaignId, changes: [{ lightId, bright: 6, dim: 6 }] })` */
export const setLightRangesCommandDto = z.strictObject({
  ...boardCommandShape,
  changes: idGroupOf(lightRangeChangeDto, (change) => change.lightId, 'light'),
});
export type SetLightRangesCommandDto = z.infer<typeof setLightRangesCommandDto>;

/** `light:setColorMany` (master): `color: null` turns the light neutral; `expect` is the color the
 *  light must still have (undo).
 *
 *  Example: `setLightColorsCommandDto.parse({ actionId, campaignId, changes: [{ lightId, color: 'fire' }] })` */
export const setLightColorsCommandDto = z.strictObject({
  ...boardCommandShape,
  changes: idGroupOf(lightColorChangeDto, (change) => change.lightId, 'light'),
});
export type SetLightColorsCommandDto = z.infer<typeof setLightColorsCommandDto>;

/** `light:setLitMany` (master): lights or puts out every light; never on the undo stack (a game
 *  action, like opening a door).
 *
 *  Example: `setLightsLitCommandDto.parse({ actionId, campaignId, lightIds: [id], lit: false })` */
export const setLightsLitCommandDto = z.strictObject({
  ...boardCommandShape,
  lightIds: lightIdGroupDto,
  lit: z.boolean(),
});
export type SetLightsLitCommandDto = z.infer<typeof setLightsLitCommandDto>;

/** `light:deleteMany` (master); `expect` lists where each light must still be.
 *
 *  Example: `deleteLightsCommandDto.parse({ actionId, campaignId, lightIds: [id] })` */
export const deleteLightsCommandDto = z
  .strictObject({
    ...boardCommandShape,
    lightIds: lightIdGroupDto,
    expect: z.array(lightAtDto).max(TOKEN_GROUP_MAX).optional(),
  })
  .superRefine(strayDeleteCheck);
export type DeleteLightsCommandDto = z.infer<typeof deleteLightsCommandDto>;

export const lightsCreatedDto = z.strictObject({ ...boardEventShape, lights: z.array(lightDto) });
export type LightsCreatedDto = z.infer<typeof lightsCreatedDto>;

export const lightsMovedDto = z.strictObject({ ...boardEventShape, moves: z.array(lightAtDto) });
export type LightsMovedDto = z.infer<typeof lightsMovedDto>;

export const lightRangesChangedDto = z.strictObject({
  ...boardEventShape,
  changes: z.array(lightRangeOfDto),
});
export type LightRangesChangedDto = z.infer<typeof lightRangesChangedDto>;

export const lightColorsChangedDto = z.strictObject({
  ...boardEventShape,
  changes: z.array(lightColorOfDto),
});
export type LightColorsChangedDto = z.infer<typeof lightColorsChangedDto>;

export const lightsLitChangedDto = z.strictObject({
  ...boardEventShape,
  lightIds: z.array(z.uuid()),
  lit: z.boolean(),
});
export type LightsLitChangedDto = z.infer<typeof lightsLitChangedDto>;

export const lightsDeletedDto = z.strictObject({
  ...boardEventShape,
  lightIds: z.array(z.uuid()),
});
export type LightsDeletedDto = z.infer<typeof lightsDeletedDto>;
