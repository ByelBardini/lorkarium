import { describe, expect, it } from 'vitest';
import {
  DRAWING_POINTS_MAX,
  createDrawingsCommandDto,
  type CreateDrawingsCommandDto,
} from '../src/board/drawing.dto';
import { SCENE_CELLS_MAX } from '../src/board/scene.dto';
import { TOKEN_GROUP_MAX } from '../src/board/token-id-group.dto';
import { REALTIME_MESSAGE_MAX_BYTES } from '../src/realtime-limits';

// Socket.IO's own default buffer: a paste of the largest drawings used to drop the connection.
const SOCKET_IO_DEFAULT_BYTES = 1_000_000;

// The longest number a point may carry: just under the edge of the scene, at full precision.
function longestCoordinate(index: number): number {
  return SCENE_CELLS_MAX - 1 - (index % 7) / 3 - 1e-13;
}

/** The largest valid `drawing:createMany`: 64 freehand paths of 2000 points each, every
 *  coordinate as long as JSON writes a number. */
function largestDrawingsCommand(): CreateDrawingsCommandDto {
  const points = Array.from({ length: DRAWING_POINTS_MAX }, (_, index): [number, number] => [
    longestCoordinate(index),
    longestCoordinate(index + 3),
  ]);
  const path = {
    kind: 'freehand' as const,
    ...{ x: 0, y: 0, width: SCENE_CELLS_MAX, height: SCENE_CELLS_MAX },
    ...{ points, stroke: 'violet' as const, strokeWidth: 'thick' as const },
  };
  return createDrawingsCommandDto.parse({
    actionId: '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a',
    campaignId: '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a',
    drawings: Array.from({ length: TOKEN_GROUP_MAX }, () => path),
  });
}

describe('REALTIME_MESSAGE_MAX_BYTES', () => {
  // All ASCII (numbers, uuids, enum words): its length in characters is its size in bytes.
  const serialized = JSON.stringify(largestDrawingsCommand()).length;

  it('the largest valid drawing:createMany, serialized, fits the buffer', () => {
    expect(serialized).toBeLessThanOrEqual(REALTIME_MESSAGE_MAX_BYTES);
  });

  it('that command does not fit the 1 MB Socket.IO default (why the buffer is set)', () => {
    expect(serialized).toBeGreaterThan(SOCKET_IO_DEFAULT_BYTES);
  });
});
