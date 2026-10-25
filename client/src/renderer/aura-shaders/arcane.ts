import { auraFragmentOf } from './aura-prelude';

/** Arcane: two rune rings turning opposite ways around the token over a swirling violet mist. */
export const ARCANE_FRAGMENT = auraFragmentOf(`
float arcaneRing(float band, float at, float width) {
  return smoothstep(width, 0.0, abs(band - at));
}

float arcaneRunes(float angle, float turns, float speed, float time) {
  float marks = 0.5 + 0.5 * sin(angle * turns + time * speed);
  return smoothstep(0.55, 0.9, marks);
}

void main(void) {
  float band = auraBand(vPosition);
  float time = auraClock();
  float angle = auraTurn() * AURA_TAU;
  float inner = arcaneRing(band, 0.45, 0.035) * (0.4 + 0.6 * arcaneRunes(angle, 16.0, 0.9, time));
  float outer = arcaneRing(band, 0.82, 0.03) * (0.4 + 0.6 * arcaneRunes(angle, 24.0, -0.6, time));
  vec2 swirl = auraOutward() * (1.5 + band * 2.0) + vec2(cos(time * 0.3), sin(time * 0.3));
  float mist = auraFbm(swirl + auraCells() * 0.6) * (1.0 - band) * 0.45;
  float pulse = 0.85 + 0.15 * sin(time * 2.4);
  vec3 rgb = mix(uAuraColor, vec3(1.0), (inner + outer) * 0.35);
  finalColor = auraOutput(rgb, (inner + outer + mist) * pulse * auraMask(band));
}
`);
