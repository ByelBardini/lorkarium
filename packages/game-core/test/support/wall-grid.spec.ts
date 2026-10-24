import { describe, expect, it } from 'vitest';
import { wallSegments } from '../../src/wall-segments';
import { stressWallGrid } from './wall-grid';

describe('stressWallGrid', () => {
  it('is 300 walls and 900 segments, with doors, grates and curtains', () => {
    const walls = stressWallGrid();
    expect(walls).toHaveLength(300);
    expect(walls.flatMap(wallSegments)).toHaveLength(900);
    expect(new Set(walls.map(({ kind }) => kind))).toEqual(
      new Set(['wall', 'door', 'grate', 'curtain']),
    );
  });
});
