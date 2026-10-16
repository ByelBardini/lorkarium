import type {
  ActiveConditionDto,
  BarInputDto,
  TokenBarDto,
  TokenDto,
  UpdateTokenCommandDto,
} from '@lorkarium/contracts';
import type { TokenAudience } from './token-access.bo';
import type { TokenRow, TokenUpdatePo } from './tokens.dao';
import type { TokenBarInputPo, TokenBarPo } from './tokens.po';

/** A token as one audience may see it: `others` never receive a `controllers` bar, and the bars
 *  they do receive keep their position (the second does not become "the first").
 *
 *  Example: `toTokenDto(row, access.audience())` */
export function toTokenDto(
  row: TokenRow,
  audience: TokenAudience,
  conditions: readonly ActiveConditionDto[] = [],
): TokenDto {
  const { id, name, initials, side, size, col, row: tokenRow } = row.token;
  const bars = row.bars.filter((bar) => audience === 'privileged' || bar.visibility === 'everyone');
  return {
    id,
    name,
    initials,
    side,
    size,
    col,
    row: tokenRow,
    controllerIds: [...row.controllerIds],
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

/** `token:update` fields → what to save, with the controllers already checked by the rule.
 *
 *  Example: `toTokenUpdatePo(command, rules.controllers(command.controllerIds))` */
export function toTokenUpdatePo(
  command: Pick<
    UpdateTokenCommandDto,
    'name' | 'initials' | 'side' | 'size' | 'controllerIds' | 'bars'
  >,
  controllerIds: readonly string[],
): TokenUpdatePo {
  const { name, initials, side, size } = command;
  return {
    fields: { name, initials, side, size },
    bars: toBarInputsPo(command.bars),
    controllerIds,
  };
}

function toTokenBarDto(bar: TokenBarPo): TokenBarDto {
  const { id, position, label, current, max, color, visibility } = bar;
  return { id, position, label, current, max, color, visibility };
}
