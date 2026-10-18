import type { EffectAreaDto } from '@lorkarium/contracts';
import { ANA_AT_TABLE, BIA_AT_TABLE } from './table-session-fixtures';

export const BIA_CONE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const ANA_CIRCLE_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

/** Bia's diagonal cone at VHARN: from the corner (6, 6), facing 45 (down right), reach 3, ember.
 *
 *  Example: `vharnBoard({ effectAreas: [biaCone({ reach: 4 })] })` */
export function biaCone(overrides: Partial<EffectAreaDto> = {}): EffectAreaDto {
  return {
    id: BIA_CONE_ID,
    authorId: BIA_AT_TABLE.userId,
    kind: 'diagonal_cone',
    x: 6,
    y: 6,
    reach: 3,
    facing: 45,
    color: 'ember',
    ...overrides,
  } as EffectAreaDto;
}

/** Ana's grid circle at VHARN: centered on (10, 5), reach 2, moss.
 *
 *  Example: `vharnBoard({ effectAreas: [biaCone(), anaCircle()] })` */
export function anaCircle(overrides: Partial<EffectAreaDto> = {}): EffectAreaDto {
  return {
    id: ANA_CIRCLE_ID,
    authorId: ANA_AT_TABLE.userId,
    kind: 'circle',
    x: 10,
    y: 5,
    reach: 2,
    color: 'moss',
    ...overrides,
  } as EffectAreaDto;
}
