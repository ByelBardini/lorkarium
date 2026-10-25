import { auraFragmentOf } from './aura-prelude';

/** Radiant: a warm glow that breathes, crossed by soft rays turning slowly around the token. */
export const RADIANT_FRAGMENT = auraFragmentOf(`
void main(void) {
  float band = auraBand(vPosition);
  float time = auraClock();
  float angle = auraTurn() * AURA_TAU;
  float rays = pow(0.5 + 0.5 * sin(angle * 12.0 + time * 0.6), 4.0);
  float counter = pow(0.5 + 0.5 * sin(angle * 7.0 - time * 0.4), 6.0);
  float breath = 0.85 + 0.15 * sin(time * 1.8);
  float glow = pow(1.0 - clamp(band, 0.0, 1.0), 1.6);
  float alpha = (glow * 0.55 + (rays + counter * 0.6) * glow * 0.45) * breath;
  vec3 rgb = mix(uAuraColor, vec3(1.0, 0.98, 0.9), glow * 0.45);
  finalColor = auraOutput(rgb, alpha * auraMask(band));
}
`);
