import { auraFragmentOf } from './aura-prelude';

/** Frost: a cold mist hugging the token, hard-edged rime near its edge and slow twinkling ice. */
export const FROST_FRAGMENT = auraFragmentOf(`
float frostGlint(vec2 cells, float time) {
  vec2 grid = cells * 4.0;
  vec2 cell = floor(grid);
  vec2 spot = vec2(auraHash(cell + 2.3), auraHash(cell + 5.9)) * 0.7 + 0.15;
  float twinkle = pow(0.5 + 0.5 * sin(time * 2.5 + auraHash(cell) * AURA_TAU), 6.0);
  float point = smoothstep(0.09, 0.0, length(fract(grid) - spot));
  return point * twinkle * step(0.6, auraHash(cell + 8.1));
}

void main(void) {
  float band = auraBand(vPosition);
  float time = auraClock();
  vec2 cells = auraCells();
  float mist = auraFbm(cells * 1.3 + vec2(time * 0.05, time * 0.03));
  float facets = 1.0 - abs(auraFbm(cells * 2.2 + 4.0) - 0.5) * 2.0;
  float rime = smoothstep(0.6, 0.0, band) * smoothstep(0.55, 0.95, facets) * (0.6 + 0.4 * mist);
  float glint = frostGlint(cells, time);
  float alpha = (1.0 - band) * 0.3 * mist + rime * 0.55 + glint;
  vec3 rgb = mix(uAuraColor, vec3(1.0), clamp(rime + glint, 0.0, 1.0) * 0.5);
  finalColor = auraOutput(rgb, alpha * auraMask(band));
}
`);
