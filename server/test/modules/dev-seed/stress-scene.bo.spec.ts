import { TOKEN_GROUP_MAX } from '@lorkarium/contracts';
import { boxFits, lightFits, lightRange, sceneLight } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  inStressBatches,
  requireStressSeedAllowed,
  stressSceneOf,
} from '../../../src/modules/dev-seed/stress-scene.bo';

const CAIO_ID = '0b1c2d3e-4f50-4a61-8b72-9c83d4e5f6a7';

describe('stressSceneOf', () => {
  it('has the target size: 300 tokens, 300 walls, 40 lights on a dark 100 × 100 grid', () => {
    const scene = stressSceneOf(CAIO_ID);
    expect(scene.tokens).toHaveLength(300);
    expect(scene.walls).toHaveLength(300);
    expect(scene.lights).toHaveLength(40);
    expect(scene.grid).toMatchObject({ widthCells: 100, heightCells: 100 });
    expect(scene.vision).toBe('dark');
  });

  it('gives the player two tokens that see in the dark and no one else', () => {
    const mine = stressSceneOf(CAIO_ID).tokens.filter(({ controllerIds }) =>
      controllerIds.includes(CAIO_ID),
    );
    expect(mine).toHaveLength(2);
    expect(mine.every(({ sight }) => sight?.bright === 6)).toBe(true);
  });

  it('puts every token, wall and light inside the scene', () => {
    const { grid, tokens, walls, lights } = stressSceneOf(CAIO_ID);
    const outside = [
      ...tokens.filter(
        ({ col, row, width, height }) => !boxFits(grid, { x: col, y: row, width, height }),
      ),
      ...walls.filter(({ x, y, width, height }) => !boxFits(grid, { x, y, width, height })),
      ...lights.filter(({ x, y, bright, dim, facing, angle }) => {
        const range = lightRange(bright, dim);
        return !lightFits(grid, sceneLight({ x, y, range, lit: true, facing, angle }));
      }),
    ];
    expect(outside).toEqual([]);
  });

  it('comes out the same at every call', () => {
    expect(stressSceneOf(CAIO_ID)).toEqual(stressSceneOf(CAIO_ID));
  });
});

describe('inStressBatches', () => {
  it('cuts 300 items in batches of at most 64, in order', () => {
    const batches = inStressBatches(Array.from({ length: 300 }, (_, index) => index));
    expect(batches.map((batch) => batch.length)).toEqual([64, 64, 64, 64, 44]);
    expect(batches.every((batch) => batch.length <= TOKEN_GROUP_MAX)).toBe(true);
    expect(batches.flat()).toEqual(Array.from({ length: 300 }, (_, index) => index));
  });
});

describe('requireStressSeedAllowed', () => {
  it('refuses production, citing the value received and the one expected', () => {
    expect(() => requireStressSeedAllowed('production')).toThrow(
      expect.objectContaining({
        code: 'STRESS_SEED_REFUSED',
        message: expect.stringMatching(/NODE_ENV=production.*development or test/),
      }),
    );
  });

  it.each(['development', 'test'] as const)('lets %s through', (nodeEnv) => {
    expect(() => requireStressSeedAllowed(nodeEnv)).not.toThrow();
  });
});
