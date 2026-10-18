import type {
  ActiveConditionDto,
  BarInputDto,
  TokenBarDto,
  TokenDto,
  UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import type { TokenAudience } from './token-access.bo';
import type { TokenRow, TokenUpdatePo } from './tokens.dao';
import type { TokenBarInputPo, TokenBarPo, TokenLookPo } from './tokens.po';

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
  'name' | 'initials' | 'side' | 'width' | 'height' | 'controllerIds' | 'bars' | keyof TokenLookPo
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
    fields: { name, initials, side, width, height, ...definedLookOf(command) },
    bars: toBarInputsPo(command.bars),
    controllerIds,
  };
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
