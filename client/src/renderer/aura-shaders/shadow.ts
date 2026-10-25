import { auraFragmentOf } from './aura-prelude';

// Drawn with the normal blend (see AURA_EFFECT_LOOKS): the alpha darkens the floor below it.
/** Shadow: dark smoke curling in toward the token, thickest at its feet. */
export const SHADOW_FRAGMENT = auraFragmentOf(`
void main(void) {
  float band = auraBand(vPosition);
  float time = auraClock();
  vec2 cells = auraCells();
  vec2 outward = auraOutward();
  float smoke = auraFbm(outward * 2.2 + vec2(band * 2.5 + time * 0.35, time * 0.05));
  float wisps = auraFbm(cells * 3.0 - vec2(0.0, time * 0.2) + smoke * 2.0);
  float body = smoothstep(0.2, 0.75, smoke * 0.7 + wisps * 0.5 + (1.0 - band) * 0.45);
  vec3 rgb = uAuraColor * (0.6 + 0.4 * wisps);
  finalColor = auraOutput(rgb, body * 0.85 * auraMask(band));
}
`);
