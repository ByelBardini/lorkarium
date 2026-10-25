import { auraFragmentOf } from './aura-prelude';

/** Lightning: thin jagged arcs crackling around the token, re-struck several times a second, over a
 *  faint electric glow. */
export const LIGHTNING_FRAGMENT = auraFragmentOf(`
float lightningArc(vec2 outward, float band, float strike, float lane) {
  float path = auraFbm(outward * 2.4 + vec2(lane * 3.1, strike + lane * 7.0));
  float jag = auraNoise(outward * 22.0 + vec2(strike * 3.0 + lane)) * 0.08;
  float arcAt = 0.15 + path * 0.8 + jag;
  return smoothstep(0.045, 0.0, abs(band - arcAt));
}

void main(void) {
  float band = auraBand(vPosition);
  float time = auraClock();
  vec2 outward = auraOutward();
  float strike = floor(time * 9.0);
  float arcs = lightningArc(outward, band, strike, 0.0) + lightningArc(outward, band, strike, 1.0);
  float flash = step(0.35, auraHash(vec2(strike, uSeed * 13.0)));
  float glow = (1.0 - band) * 0.22 * (0.7 + 0.3 * sin(time * 23.0));
  vec3 rgb = mix(uAuraColor, vec3(1.0), clamp(arcs, 0.0, 1.0) * 0.7);
  finalColor = auraOutput(rgb, (arcs * flash + glow) * auraMask(band));
}
`);
