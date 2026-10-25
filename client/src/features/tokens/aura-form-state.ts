import type {
  AuraEffectDto,
  DrawingColorDto,
  TokenAuraDto,
  TokenAuraKindDto,
} from '@lorkarium/contracts';
import { AURA_RADIUS_MAX } from '@lorkarium/game-core';
import { cellsIn, distanceTextOf, type SceneDistance } from '@/lib/range-form';

export type AuraKindChoice = 'none' | TokenAuraKindDto;

/** The aura as the form holds it: the radius typed in the scene's unit (past the token's edge),
 *  and every kind's own choice kept, so going Cor → Efeito → Cor brings the tint back. */
export type AuraFormValues = Readonly<{
  kind: AuraKindChoice;
  radius: string;
  color: DrawingColorDto;
  effect: AuraEffectDto;
  /** `null` = the natural tone of the effect. */
  effectColor: DrawingColorDto | null;
  imageAssetId: string | null;
  opacity: number;
}>;

export type AuraFormErrors = Readonly<{ radius?: string; image?: string }>;

export type AuraFormResult =
  | Readonly<{ ok: true; aura: TokenAuraDto | null }>
  | Readonly<{ ok: false; errors: AuraFormErrors }>;

export const AURA_RADIUS_MISSING = 'Informe o raio.';
export const AURA_IMAGE_MISSING = 'Escolha a imagem da aura.';

// The paladin's 3 m (2 cells on a 1.5 m grid): what the radius shows before anything is chosen.
const DEFAULT_RADIUS_CELLS = 2;

// A tint over the floor reads at half; an effect or an image is drawn whole.
const OPENING_OPACITY: Readonly<Record<TokenAuraKindDto, number>> = {
  color: 50,
  effect: 100,
  image: 100,
};

/** The form of a token's aura (none → "Nenhuma" with the radius ready at 2 cells).
 *
 *  Example: `auraFormOf(token.aura, { cellDistance: 1.5, cellUnit: 'm' })` */
export function auraFormOf(aura: TokenAuraDto | null, distance: SceneDistance): AuraFormValues {
  const blank: AuraFormValues = {
    kind: 'none',
    radius: distanceTextOf(DEFAULT_RADIUS_CELLS, distance),
    color: 'gold',
    effect: 'fire',
    effectColor: null,
    imageAssetId: null,
    opacity: OPENING_OPACITY.color,
  };
  if (!aura) return blank;
  const shared = { radius: distanceTextOf(aura.radius, distance), opacity: aura.opacity };
  if (aura.kind === 'color') return { ...blank, ...shared, kind: 'color', color: aura.color };
  if (aura.kind === 'image') {
    return { ...blank, ...shared, kind: 'image', imageAssetId: aura.imageAssetId };
  }
  return { ...blank, ...shared, kind: 'effect', effect: aura.effect, effectColor: aura.color };
}

/** The form after picking a kind: from "Nenhuma" the opacity opens at the kind's own (Cor 50%,
 *  Efeito and Imagem 100%); between kinds the radius and the opacity stay.
 *
 *  Example: `auraKindChosen(form, 'effect')` */
export function auraKindChosen(form: AuraFormValues, kind: AuraKindChoice): AuraFormValues {
  if (kind === 'none' || form.kind !== 'none') return { ...form, kind };
  return { ...form, kind, opacity: OPENING_OPACITY[kind] };
}

/** The form → the aura to send (radius in cells to the hundredth), or what is missing. "Nenhuma"
 *  is `null` whatever was typed.
 *
 *  Example: `parseAuraForm(form, scene)` → `{ ok: true, aura: { kind: 'effect', radius: 2, … } }` */
export function parseAuraForm(form: AuraFormValues, distance: SceneDistance): AuraFormResult {
  if (form.kind === 'none') return { ok: true, aura: null };
  const radius = radiusOf(form.radius, distance);
  if (typeof radius === 'string') return { ok: false, errors: { radius } };
  const { opacity } = form;
  if (form.kind === 'color') {
    return { ok: true, aura: { kind: 'color', radius, opacity, color: form.color } };
  }
  if (form.kind === 'effect') {
    const effect = { effect: form.effect, color: form.effectColor };
    return { ok: true, aura: { kind: 'effect', radius, opacity, ...effect } };
  }
  if (!form.imageAssetId) return { ok: false, errors: { image: AURA_IMAGE_MISSING } };
  return { ok: true, aura: { kind: 'image', radius, opacity, imageAssetId: form.imageAssetId } };
}

// The cells of the typed radius, or the words of what is wrong with it.
function radiusOf(typed: string, distance: SceneDistance): number | string {
  if (typed.trim() === '') return AURA_RADIUS_MISSING;
  const cells = cellsIn(typed, distance);
  if (Number.isFinite(cells) && cells >= 0 && cells <= AURA_RADIUS_MAX) return cells;
  return `De 0 a ${distanceTextOf(AURA_RADIUS_MAX, distance)} ${distance.cellUnit}.`;
}
