import { describe, expect, it } from 'vitest';
import { bytesToMegabytes, textureMemoryBytes } from '@/renderer/texture-memory';

describe('textureMemoryBytes', () => {
  it('counts width × height × resolution² × 4 bytes: 100 × 50 at resolution 2 is 80 000', () => {
    expect(textureMemoryBytes([{ width: 100, height: 50, resolution: 2 }])).toBe(80_000);
  });

  it('sums different textures', () => {
    const sources = [
      { width: 100, height: 50, resolution: 2 },
      { width: 10, height: 10, resolution: 1 },
    ];
    expect(textureMemoryBytes(sources)).toBe(80_400);
  });

  it('counts the same texture once however many times it is listed', () => {
    const atlas = { width: 100, height: 50, resolution: 2 };
    expect(textureMemoryBytes([atlas, atlas])).toBe(80_000);
  });

  it('counts two equal but distinct textures twice', () => {
    const first = { width: 100, height: 50, resolution: 2 };
    expect(textureMemoryBytes([first, { ...first }])).toBe(160_000);
  });

  it('is 0 for no texture', () => {
    expect(textureMemoryBytes([])).toBe(0);
  });

  it.each([
    ['width', { width: -1, height: 50, resolution: 2 }, '-1'],
    ['height', { width: 100, height: Number.NaN, resolution: 2 }, 'NaN'],
    ['resolution', { width: 100, height: 50, resolution: -2 }, '-2'],
  ])('refuses a %s that is not a number ≥ 0, naming it', (field, source, shown) => {
    expect(() => textureMemoryBytes([source])).toThrow(
      `texture ${field}: expected a finite number ≥ 0, got ${shown}`,
    );
  });
});

describe('bytesToMegabytes', () => {
  it('divides by 1024²', () => {
    expect(bytesToMegabytes(43_515_904)).toBe(41.5);
    expect(bytesToMegabytes(0)).toBe(0);
  });
});
