/** The uniforms every aura fragment reads, by name; `pixi-aura-effect.ts` fills them per aura.
 *  `uColor` is not here: Pixi's mesh pipe fills it with the group alpha (the hidden token fade). */
export const AURA_UNIFORMS = [
  'uTime',
  'uHalfBox',
  'uRadius',
  'uCellSize',
  'uOpacity',
  'uAuraColor',
  'uSeed',
] as const;

export type AuraUniformName = (typeof AURA_UNIFORMS)[number];

// No `#version 300 es`: Pixi then adds the WebGL1 defines (`in` → varying, finalColor →
// gl_FragColor), so the same source runs on WebGL2 and on a WebGL1 fallback. Never use `in` as a
// parameter qualifier nor the name `texture`: the defines would rewrite them.
/** The quad of one aura: positions in world px around the token center, handed on as `vPosition`. */
export const AURA_VERTEX = `
in vec2 aPosition;
out vec2 vPosition;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main(void) {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vPosition = aPosition;
}
`;

/** Shared GLSL of every aura fragment: the uniforms, the distance to the token box (whose level
 *  set at the radius is the footprint grown with rounded corners), value noise, fbm and the
 *  premultiplied output. */
export const AURA_PRELUDE = `
in vec2 vPosition;
out vec4 finalColor;

uniform float uTime;
uniform vec2 uHalfBox;
uniform float uRadius;
uniform float uCellSize;
uniform float uOpacity;
uniform vec3 uAuraColor;
uniform float uSeed;
uniform vec4 uColor;

const float AURA_TAU = 6.28318530718;

float auraBoxDistance(vec2 p, vec2 halfBox) {
  vec2 q = abs(p) - halfBox;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// 0 on the token edge, 1 on the outer edge of the aura, negative inside the token.
float auraBand(vec2 p) {
  return auraBoxDistance(p, uHalfBox) / max(uRadius, 1.0);
}

// Fades to nothing at the outer edge and mostly clears the token itself.
float auraMask(float band) {
  return (1.0 - smoothstep(0.72, 1.0, band)) * smoothstep(-0.25, 0.06, band);
}

float auraHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float auraNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = auraHash(i);
  float b = auraHash(i + vec2(1.0, 0.0));
  float c = auraHash(i + vec2(0.0, 1.0));
  float d = auraHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Each octave is turned (and scaled ×2): stacked on the same axes, value noise shows its grid.
float auraFbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * auraNoise(p);
    p = turn * p + vec2(17.0, 9.2);
    amplitude *= 0.5;
  }
  return value;
}

// The local position in cells, so the grain of an effect is the same at any aura size.
vec2 auraCells() {
  return vPosition / max(uCellSize, 1.0);
}

// Each token runs its own clock offset, so two auras never move in lockstep.
float auraClock() {
  return uTime + uSeed * 97.0;
}

// The angle around the token, 0..1. It jumps from 1 to 0 on the left: read it only through
// periodic functions with a whole number of turns, or noise has a seam there.
float auraTurn() {
  return atan(vPosition.y, vPosition.x) / AURA_TAU + 0.5;
}

// The unit direction from the token center: noise over it has no seam around the circle.
vec2 auraOutward() {
  return normalize(vPosition + vec2(0.0001));
}

vec4 auraOutput(vec3 rgb, float alpha) {
  float a = clamp(alpha, 0.0, 1.0) * uOpacity * uColor.a;
  return vec4(rgb * a, a);
}
`;

/** One fragment from the prelude and the effect's own `main`.
 *
 *  Example: `auraFragmentOf('void main(void) { finalColor = auraOutput(uAuraColor, 1.0); }')` */
export function auraFragmentOf(body: string): string {
  return `${AURA_PRELUDE}\n${body}`;
}
