import { auraColorChannels, type AuraUniforms } from './aura-effect-looks';
import type { AuraUniformName } from './aura-shaders/aura-prelude';

/** The live values of one aura's uniforms, by the names in `AURA_UNIFORMS`; the vectors are
 *  reused arrays so an update never allocates. */
export type AuraUniformValues = { [Name in AuraUniformName]: AuraUniformValue<Name> };

type AuraUniformValue<Name extends AuraUniformName> = Name extends 'uHalfBox' | 'uAuraColor'
  ? Float32Array
  : number;

/** A set of values for a new aura: clock at 0, nothing visible until the first write.
 *
 *  Example: `new UniformGroup(auraUniformStructuresOf(newAuraUniformValues()))` */
export function newAuraUniformValues(): AuraUniformValues {
  return {
    uTime: 0,
    uHalfBox: new Float32Array(2),
    uRadius: 0,
    uCellSize: 1,
    uOpacity: 0,
    uAuraColor: new Float32Array(3),
    uSeed: 0,
  };
}

/** The GLSL-side type of each aura uniform, as Pixi's `UniformGroup` names it. */
export const AURA_UNIFORM_TYPES = {
  uTime: 'f32',
  uHalfBox: 'vec2<f32>',
  uRadius: 'f32',
  uCellSize: 'f32',
  uOpacity: 'f32',
  uAuraColor: 'vec3<f32>',
  uSeed: 'f32',
} as const satisfies Record<AuraUniformName, string>;

/** What a `UniformGroup` is built from: each value with its GLSL-side type. */
export type AuraUniformStructures = {
  [Name in AuraUniformName]: {
    value: AuraUniformValue<Name>;
    type: (typeof AURA_UNIFORM_TYPES)[Name];
  };
};

/** The structures a `UniformGroup` is built from; the group keeps these very values (and arrays),
 *  so writing into `group.uniforms` is what the shader reads next draw.
 *
 *  Example: `new UniformGroup(auraUniformStructuresOf(newAuraUniformValues()))` */
export function auraUniformStructuresOf(values: AuraUniformValues): AuraUniformStructures {
  return {
    uTime: { value: values.uTime, type: AURA_UNIFORM_TYPES.uTime },
    uHalfBox: { value: values.uHalfBox, type: AURA_UNIFORM_TYPES.uHalfBox },
    uRadius: { value: values.uRadius, type: AURA_UNIFORM_TYPES.uRadius },
    uCellSize: { value: values.uCellSize, type: AURA_UNIFORM_TYPES.uCellSize },
    uOpacity: { value: values.uOpacity, type: AURA_UNIFORM_TYPES.uOpacity },
    uAuraColor: { value: values.uAuraColor, type: AURA_UNIFORM_TYPES.uAuraColor },
    uSeed: { value: values.uSeed, type: AURA_UNIFORM_TYPES.uSeed },
  };
}

/** Writes an aura into its values in place (the clock is the animator's, left as it is).
 *
 *  Example: `writeAuraUniformValues(group.uniforms, auraUniformsOf(input))` */
export function writeAuraUniformValues(values: AuraUniformValues, uniforms: AuraUniforms): void {
  values.uHalfBox[0] = uniforms.halfBox[0];
  values.uHalfBox[1] = uniforms.halfBox[1];
  values.uRadius = uniforms.radius;
  values.uCellSize = uniforms.cellSize;
  values.uOpacity = uniforms.opacity;
  values.uAuraColor.set(auraColorChannels(uniforms.color));
  values.uSeed = uniforms.seed;
}
