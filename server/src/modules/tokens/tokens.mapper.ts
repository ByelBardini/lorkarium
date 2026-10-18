import type {
  ActiveConditionDto,
  BarInputDto,
  SightDto,
  TokenBarDto,
  TokenDto,
  UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import { eyeOf, sightRange, tokenCenter, type Eye, type SightMode } from '@lorkarium/game-core';
import type { TokenAudience } from './token-access.bo';
import type { TokenRow, TokenUpdatePo } from './tokens.dao';
import type { TokenBarInputPo, TokenBarPo, TokenLookPo, TokenSightPo } from './tokens.po';

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
  const { imageAssetId, frame, flipX, flipY, facing } = row.token;
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
    sight: sightOfToken(row.token),
    canControl: audience === 'privileged',
    bars: bars.map(toTokenBarDto),
    conditions: [...conditions],
  };
}

/** The bars of a command → the rows to save, in the order sent (their position).
 *
 *  Example: `await tokens.insert({ token, bars: toBarInputsPo(command.bars), controllerIds })` */
export function toBarInputsPo(bars: readonly BarInputDto[]): TokenBarInputPo[] {
  return bars.map(({ label, current, max, color, visibility }) => ({
    label,
    current,
    max,
    color,
    visibility,
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
  return { sightBright: sightNumeric(sight.bright), sightDim: sightNumeric(sight.dim) };
}

/** The eye of a saved token in a scene of `mode`, or `null` when it does not see there.
 *
 *  Example: `rows.map((row) => tokenEyeOf(row, scene.visionMode))` */
export function tokenEyeOf(row: TokenRow, mode: SightMode): Eye | null {
  const sight = sightOfToken(row.token);
  const range = sight ? sightRange(sight.bright, sight.dim) : null;
  return eyeOf(tokenCenter(row.token, row.token), range, mode);
}

function sightOfToken({ sightBright, sightDim }: TokenSightPo): SightDto | null {
  if (sightBright === null || sightDim === null) return null;
  return { bright: Number(sightBright), dim: Number(sightDim) };
}

function sightNumeric(cells: number): string {
  return (Math.round(cells * 100) / 100).toFixed(2);
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
  const { id, position, label, current, max, color, visibility } = bar;
  return { id, position, label, current, max, color, visibility };
}
