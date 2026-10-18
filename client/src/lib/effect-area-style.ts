import type { DrawingColorDto, EffectAreaKindDto } from '@lorkarium/contracts';

/** How the next area of effect looks: its shape and its color (filled at 35%, solid outline). */
export type EffectAreaStyle = Readonly<{ kind: EffectAreaKindDto; color: DrawingColorDto }>;

export const DEFAULT_EFFECT_AREA_STYLE: EffectAreaStyle = { kind: 'circle', color: 'ember' };

/** The fill of every area: the map and the tokens stay visible under it. */
export const EFFECT_AREA_FILL_ALPHA = 0.35;

/** The nine shapes in the order of the panel, with their name in pt-BR. */
export const EFFECT_AREA_KINDS: ReadonlyArray<
  Readonly<{ kind: EffectAreaKindDto; label: string }>
> = [
  { kind: 'square', label: 'Quadrado' },
  { kind: 'circle', label: 'Círculo' },
  { kind: 'semicircle', label: 'Semicírculo' },
  { kind: 'orthogonal_cone', label: 'Cone horizontal' },
  { kind: 'diagonal_cone', label: 'Cone diagonal' },
  { kind: 'line', label: 'Linha' },
  { kind: 'emanation', label: 'Emanação' },
  { kind: 'smooth_circle', label: 'Círculo perfeito' },
  { kind: 'smooth_semicircle', label: 'Semicírculo perfeito' },
];

/** The name of a shape as the person reads it.
 *
 *  Example: `effectAreaKindLabel('diagonal_cone') // 'Cone diagonal'` */
export function effectAreaKindLabel(kind: EffectAreaKindDto): string {
  return EFFECT_AREA_KINDS.find((entry) => entry.kind === kind)?.label ?? kind;
}
