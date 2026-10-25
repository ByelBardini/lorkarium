import type { AuraEffectDto, TokenAuraDto } from '@lorkarium/contracts';
import { drawingColorValue } from '@/lib/drawing-style';
import { AURA_EFFECT_LOOKS, auraEffectColorOf } from '@/renderer/aura-effect-looks';

// The tones live once, in the renderer's effect looks (pure, no PixiJS): the form and the preview
// paint with the same color the board draws.
function cssOf(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** The CSS tone of an aura as the board draws it: the palette color, the effect's natural tone, or
 *  `null` for an image (it has no tone of its own).
 *
 *  Example: `auraToneCss({ kind: 'color', color: 'gold', radius: 2, opacity: 50 }) // '#c5a46d'` */
export function auraToneCss(aura: TokenAuraDto): string | null {
  if (aura.kind === 'image') return null;
  if (aura.kind === 'color') return cssOf(drawingColorValue(aura.color));
  return cssOf(auraEffectColorOf(aura.effect, aura.color));
}

/** The CSS of an effect's natural tone (the "Natural" tile of the form).
 *
 *  Example: `naturalToneCss('fire') // '#ff7a2a'` */
export function naturalToneCss(effect: AuraEffectDto): string {
  return cssOf(AURA_EFFECT_LOOKS[effect].naturalColor);
}
