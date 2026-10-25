import { AURA_EFFECTS, type AuraEffectDto } from '@lorkarium/contracts';

// The contracts know only the names; the words are the client's (the tones and shaders live in
// the renderer, `aura-effect-looks.ts`). A Record makes a new effect without a name a type error.
const EFFECT_LABELS: Readonly<Record<AuraEffectDto, string>> = {
  fire: 'Fogo',
  water: 'Água',
  lightning: 'Elétrico',
  frost: 'Gelo',
  radiant: 'Sagrado',
  shadow: 'Sombrio',
  poison: 'Veneno',
  arcane: 'Arcano',
};

/** The ready-made aura effects with their Portuguese names, in the order of the picker. */
export const AURA_EFFECT_NAMES: ReadonlyArray<Readonly<{ effect: AuraEffectDto; label: string }>> =
  AURA_EFFECTS.map((effect) => ({ effect, label: EFFECT_LABELS[effect] }));

/** The Portuguese name of an aura effect.
 *
 *  Example: `auraEffectLabel('lightning') // 'Elétrico'` */
export function auraEffectLabel(effect: AuraEffectDto): string {
  return EFFECT_LABELS[effect];
}
