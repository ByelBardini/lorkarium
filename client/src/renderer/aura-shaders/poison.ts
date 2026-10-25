import { auraFragmentOf } from './aura-prelude';

/** Poison: a sickly churning haze with bubbles rising and popping through it. */
export const POISON_FRAGMENT = auraFragmentOf(`
float poisonBubble(vec2 cells, float time) {
  vec2 grid = cells * 2.2 + vec2(0.0, -time * 0.45);
  vec2 cell = floor(grid);
  float life = fract(time * 0.3 + auraHash(cell));
  vec2 middle = vec2(auraHash(cell + 3.1), auraHash(cell + 7.7)) * 0.6 + 0.2;
  float size = 0.08 + 0.14 * life;
  float ring = smoothstep(size, size - 0.04, length(fract(grid) - middle));
  return ring * (1.0 - life) * step(0.55, auraHash(cell + 1.9));
}

void main(void) {
  float band = auraBand(vPosition);
  float time = auraClock();
  vec2 cells = auraCells();
  float haze = auraFbm(cells * 1.1 + vec2(sin(time * 0.3), time * 0.12));
  float churn = auraFbm(cells * 2.6 - vec2(time * 0.2, 0.0) + haze * 1.5);
  float bubbles = poisonBubble(cells, time);
  float alpha = ((1.0 - band) * 0.35 + churn * 0.4) * haze * 1.3 + bubbles * 0.8;
  vec3 rgb = mix(uAuraColor * 0.7, mix(uAuraColor, vec3(1.0), 0.4), bubbles);
  finalColor = auraOutput(rgb, alpha * auraMask(band));
}
`);
