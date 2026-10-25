import { auraFragmentOf } from './aura-prelude';

/** Water: rings rippling out from the token, bent by a slow current, with bright caustic crests. */
export const WATER_FRAGMENT = auraFragmentOf(`
void main(void) {
  float band = auraBand(vPosition);
  float time = auraClock();
  vec2 cells = auraCells();
  float current = auraFbm(cells * 0.9 + vec2(time * 0.15, -time * 0.1));
  float ripple = 0.5 + 0.5 * sin(band * 14.0 - time * 2.2 + current * 5.0);
  float caustic = pow(auraFbm(cells * 2.4 + current * 1.5 + time * 0.25), 3.0) * 2.2;
  float body = 0.32 + 0.38 * ripple + caustic * 0.5;
  vec3 rgb = mix(uAuraColor * 0.7, mix(uAuraColor, vec3(1.0), 0.6), clamp(caustic, 0.0, 1.0));
  finalColor = auraOutput(rgb, body * (1.0 - band * 0.45) * auraMask(band));
}
`);
