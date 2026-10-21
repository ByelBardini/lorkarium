import type {
  ActiveConditionDto,
  BarInputDto,
  TokenLightDto,
  SightDto,
  TokenBarDto,
  TokenDto,
  UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import {
  coneOf,
  eyeFieldOf,
  eyeOf,
  lightRange,
  lightSource,
  sightRange,
  tokenCenter,
  type Eye,
  type LightSource,
} from '@lorkarium/game-core';
import { cellsNumeric } from '../../database/cells-numeric';
import type { TokenAudience } from './token-access.bo';
import type { TokenRow, TokenUpdatePo } from './tokens.dao';
import type {
  TokenBarInputPo,
  TokenBarPo,
  TokenLightPo,
  TokenLookPo,
  TokenPo,
  TokenSightPo,
} from './tokens.po';

/** A token as one audience may see it: `others` never receive a `controllers` bar, and the bars
 *  they do receive keep their position (the second does not become "the first").
 *
 *  Example: `toTokenDto(row, access.audience())` */
export function toTokenDto(
  row: TokenRow,
  audience: TokenAudience,
  conditions: readonly ActiveConditionDto[] = [],
): TokenDto {
  const { id, name, initials, side, width, height, col, row: tokenRow, layer } = row.token;
  const { imageAssetId, frame, flipX, flipY, facing, defeated, sightAngle } = row.token;
  const bars = row.bars.filter((bar) => audience === 'privileged' || bar.visibility === 'everyone');
  return {
    id,
    name,
    initials,
    side,
    width,
    height,
    col,
    row: tokenRow,
    layer,
    controllerIds: [...row.controllerIds],
    imageAssetId,
    frame,
    flipX,
    flipY,
    facing,
    defeated,
    sightAngle,
    sight: sightOfToken(row.token),
    light: lightOfToken(row.token),
    lightLit: row.token.lightLit,
    canControl: audience === 'privileged',
    bars: bars.map(toTokenBarDto),
    conditions: [...conditions],
  };
}

/** The bars of a command → the rows to save, in the order sent (their position).
 *
 *  Example: `await tokens.insert({ token, bars: toBarInputsPo(command.bars), controllerIds })` */
export function toBarInputsPo(bars: readonly BarInputDto[]): TokenBarInputPo[] {
  return bars.map(({ label, current, max, color, visibility, display }) => ({
    label,
    current,
    max,
    color,
    visibility,
    display,
  }));
}

type UpdatedFields = Pick<
  UpdateTokenCommandDto,
  | 'name'
  | 'initials'
  | 'side'
  | 'width'
  | 'height'
  | 'controllerIds'
  | 'bars'
  | 'sight'
  | 'sightAngle'
  | 'light'
  | keyof TokenLookPo
>;

/** `token:update` fields → what to save, with the controllers already checked by the rule; a look
 *  field the command left out is not written (the token keeps it).
 *
 *  Example: `toTokenUpdatePo(command, rules.controllers(command.controllerIds))` */
export function toTokenUpdatePo(
  command: UpdatedFields,
  controllerIds: readonly string[],
): TokenUpdatePo {
  const { name, initials, side, width, height } = command;
  return {
    fields: {
      name,
      initials,
      side,
      width,
      height,
      ...definedLookOf(command),
      ...(command.sight === undefined ? {} : toTokenSightPo(command.sight)),
      ...(command.sightAngle === undefined ? {} : { sightAngle: command.sightAngle }),
      ...(command.light === undefined ? {} : toTokenLightPo(command.light)),
    },
    bars: toBarInputsPo(command.bars),
    controllerIds,
  };
}

/** A sight as sent → the two numeric columns, to the hundredth; `null` (blind) clears both.
 *
 *  Example: `toTokenSightPo({ bright: 12, dim: 4 }) // { sightBright: '12.00', sightDim: '4.00' }` */
export function toTokenSightPo(sight: SightDto | null | undefined): TokenSightPo {
  if (!sight) return { sightBright: null, sightDim: null };
  return { sightBright: cellsNumeric(sight.bright), sightDim: cellsNumeric(sight.dim) };
}

/** A light as sent → the two numeric columns, to the hundredth, its color and its beam; `null`
 *  (no light) clears the three and opens the beam back to 360.
 *
 *  Example: `toTokenLightPo({ bright: 4, dim: 4, color: 'fire', angle: 60 }) // { lightBright: '4.00', lightDim: '4.00', lightColor: 'fire', lightAngle: 60 }` */
export function toTokenLightPo(light: TokenLightDto | null | undefined): TokenLightPo {
  if (!light) return { lightBright: null, lightDim: null, lightColor: null, lightAngle: 360 };
  return {
    lightBright: cellsNumeric(light.bright),
    lightDim: cellsNumeric(light.dim),
    lightColor: light.color,
    lightAngle: light.angle,
  };
}

/** The light a saved token gives off, from the center of its footprint and in the cone of its
 *  beam toward its facing; `null` without a light or with it out.
 *
 *  Example: `rows.flatMap((row) => tokenLightOf(row) ?? [])` */
export function tokenLightOf(row: TokenRow): LightSource | null {
  const light = lightOfToken(row.token);
  const range = light ? lightRange(light.bright, light.dim) : null;
  const cone = coneOf(row.token.facing, row.token.lightAngle);
  return lightSource(tokenCenter(row.token, row.token), range, row.token.lightLit, cone);
}

/** The eye of a saved token: every token is one; without darkvision it sees only what is lit, and
 *  below 360° only in its field (the cone toward its facing plus the ring around it).
 *
 *  Example: `rows.map(tokenEyeOf)` */
export function tokenEyeOf(row: TokenRow): Eye {
  const sight = sightOfToken(row.token);
  const range = sight ? sightRange(sight.bright, sight.dim) : null;
  const { col, row: tokenRow, width, height, facing, sightAngle } = row.token;
  const field = eyeFieldOf({ x: col, y: tokenRow, width, height }, facing, sightAngle);
  return eyeOf(tokenCenter(row.token, row.token), range, field);
}

function sightOfToken({ sightBright, sightDim }: TokenSightPo): SightDto | null {
  return rangeOfColumns(sightBright, sightDim);
}

function lightOfToken(columns: TokenLightPo): TokenLightDto | null {
  const range = rangeOfColumns(columns.lightBright, columns.lightDim);
  return range && { ...range, color: columns.lightColor, angle: columns.lightAngle };
}

function rangeOfColumns(
  bright: TokenPo['sightBright'],
  dim: TokenPo['sightDim'],
): Readonly<{ bright: number; dim: number }> | null {
  if (bright === null || dim === null) return null;
  return { bright: Number(bright), dim: Number(dim) };
}

function definedLookOf(command: Partial<TokenLookPo>): Partial<TokenLookPo> {
  const look: Partial<TokenLookPo> = {};
  if (command.imageAssetId !== undefined) look.imageAssetId = command.imageAssetId;
  if (command.frame !== undefined) look.frame = command.frame;
  if (command.flipX !== undefined) look.flipX = command.flipX;
  if (command.flipY !== undefined) look.flipY = command.flipY;
  return look;
}

function toTokenBarDto(bar: TokenBarPo): TokenBarDto {
  const { id, position, label, current, max, color, visibility, display } = bar;
  return { id, position, label, current, max, color, visibility, display };
}
