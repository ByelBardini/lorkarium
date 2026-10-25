import type { AuraEffectDto } from '@lorkarium/contracts';
import { ARCANE_FRAGMENT } from './arcane';
import { FIRE_FRAGMENT } from './fire';
import { FROST_FRAGMENT } from './frost';
import { LIGHTNING_FRAGMENT } from './lightning';
import { POISON_FRAGMENT } from './poison';
import { RADIANT_FRAGMENT } from './radiant';
import { SHADOW_FRAGMENT } from './shadow';
import { WATER_FRAGMENT } from './water';

export { AURA_UNIFORMS, AURA_VERTEX, type AuraUniformName } from './aura-prelude';

/** The fragment source of each ready-made effect.
 *
 *  Example: `GlProgram.from({ vertex: AURA_VERTEX, fragment: AURA_FRAGMENTS.fire })` */
export const AURA_FRAGMENTS: Readonly<Record<AuraEffectDto, string>> = {
  fire: FIRE_FRAGMENT,
  water: WATER_FRAGMENT,
  lightning: LIGHTNING_FRAGMENT,
  frost: FROST_FRAGMENT,
  radiant: RADIANT_FRAGMENT,
  shadow: SHADOW_FRAGMENT,
  poison: POISON_FRAGMENT,
  arcane: ARCANE_FRAGMENT,
};
