import { describe, expect, it } from 'vitest';
import { auraUniformsOf } from '@/renderer/aura-effect-looks';
import { AURA_UNIFORMS } from '@/renderer/aura-shaders/aura-fragments';
import {
  auraUniformStructuresOf,
  newAuraUniformValues,
  writeAuraUniformValues,
} from '@/renderer/aura-uniform-values';

const LYRA = auraUniformsOf({
  box: { x: 320, y: 320, width: 64, height: 64 },
  radiusCells: 2,
  cellSize: 64,
  opacity: 50,
  color: 0xff0000,
  tokenId: 'lyra',
});

describe('aura uniform values', () => {
  it('a fresh set starts at time 0 and fully transparent', () => {
    const values = newAuraUniformValues();
    expect(values.uTime).toBe(0);
    expect(values.uOpacity).toBe(0);
  });

  it('writing an aura fills every value the shader reads', () => {
    const values = newAuraUniformValues();
    writeAuraUniformValues(values, LYRA);
    expect(Array.from(values.uHalfBox)).toEqual([32, 32]);
    expect(values.uRadius).toBe(128);
    expect(values.uCellSize).toBe(64);
    expect(values.uOpacity).toBe(0.5);
    expect(Array.from(values.uAuraColor)).toEqual([1, 0, 0]);
    expect(values.uSeed).toBe(LYRA.seed);
  });

  it('writing again recolors and resizes in the same arrays, without recreating them', () => {
    const values = newAuraUniformValues();
    writeAuraUniformValues(values, LYRA);
    const halfBox = values.uHalfBox;
    const color = values.uAuraColor;
    writeAuraUniformValues(values, { ...LYRA, halfBox: [64, 32], color: 0x0000ff });
    expect(values.uHalfBox).toBe(halfBox);
    expect(values.uAuraColor).toBe(color);
    expect(Array.from(values.uHalfBox)).toEqual([64, 32]);
    expect(Array.from(values.uAuraColor)).toEqual([0, 0, 1]);
  });

  it('writing an aura keeps the running clock', () => {
    const values = newAuraUniformValues();
    values.uTime = 3.5;
    writeAuraUniformValues(values, LYRA);
    expect(values.uTime).toBe(3.5);
  });

  it('the group structures cover every aura uniform with its GLSL type', () => {
    const structures = auraUniformStructuresOf(newAuraUniformValues());
    expect(Object.keys(structures).sort()).toEqual([...AURA_UNIFORMS].sort());
    expect(structures.uHalfBox.type).toBe('vec2<f32>');
    expect(structures.uAuraColor.type).toBe('vec3<f32>');
    expect(structures.uTime.type).toBe('f32');
  });

  it('the group structures hold the very arrays of the values', () => {
    const values = newAuraUniformValues();
    const structures = auraUniformStructuresOf(values);
    expect(structures.uHalfBox.value).toBe(values.uHalfBox);
    expect(structures.uAuraColor.value).toBe(values.uAuraColor);
  });
});
