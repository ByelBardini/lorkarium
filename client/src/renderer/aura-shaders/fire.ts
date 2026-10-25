import { auraFragmentOf } from './aura-prelude';

/** Fire: tongues of flame licking outward from the token, hotter (whiter) near its edge. */
export const FIRE_FRAGMENT = auraFragmentOf(`
void main(void) {
  float band = auraBand(vPosition);
  float time = auraClock();
  vec2 cells = auraCells();
  vec2 outward = auraOutward();
  float flicker = auraFbm(cells * 1.7 + vec2(0.0, time * 1.3));
  float tongue = auraFbm(outward * 3.2 + vec2(band * 2.0 - time * 1.2, 0.0));
  float heat = (1.0 - band) * 1.1 + flicker * 0.6 + tongue * 0.45 - 0.65;
  float flame = smoothstep(0.0, 0.55, heat);
  vec3 core = mix(uAuraColor, vec3(1.0, 0.95, 0.8), 0.35);
  vec3 rgb = mix(uAuraColor * 0.75, core, smoothstep(0.35, 0.9, heat));
  finalColor = auraOutput(rgb, flame * auraMask(band));
}
`);
