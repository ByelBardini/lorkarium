import { test } from 'vitest';
import { lineOfSight, sightArea } from '../../src/sight-area';
import { STRESS_SCENE, stressWallGrid } from '../support/wall-grid';

// The eye's cost on the stress dungeon (docs/context/client/performance.md): an eye in the middle
// of a room, with a darkvision of 12 and with the unlimited reach of daylight.
const WALLS = stressWallGrid();
const EYE = { x: 52.5, y: 52.5 };

test('sightArea and lineOfSight over 900 segments', async ({ bench }) => {
  await bench.compare(
    bench('sightArea reach 12', () => sightArea(EYE, WALLS, STRESS_SCENE, 12)),
    bench('sightArea unlimited', () => sightArea(EYE, WALLS, STRESS_SCENE, Infinity)),
    bench('lineOfSight across the dungeon', () => lineOfSight(EYE, { x: 2.5, y: 97.5 }, WALLS)),
  );
});
