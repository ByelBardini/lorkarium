import { DRAWING_POINTS_MAX } from '@lorkarium/contracts';
import { describe, expect, it } from 'vitest';
import { COMMAND_BURST } from '../../src/realtime/command-rate.bo';
import { commandCostOf } from '../../src/realtime/command-weight';

function stroke(points: number): object {
  return { kind: 'freehand', points: Array.from({ length: points }, () => [1, 2]) };
}

describe('commandCostOf', () => {
  it('an ordinary command costs one token', () => {
    expect(commandCostOf({ campaignId: 'x', tokenId: 'y', to: { col: 1, row: 2 } })).toBe(1);
  });

  it('sixteen full freehand strokes cost nine', () => {
    const drawings = Array.from({ length: 16 }, () => stroke(DRAWING_POINTS_MAX));

    expect(commandCostOf({ drawings })).toBe(9);
  });

  it('the largest command the DTO admits fits a full bucket', () => {
    const drawings = Array.from({ length: 64 }, () => stroke(DRAWING_POINTS_MAX));

    expect(commandCostOf({ drawings })).toBe(33);
    expect(commandCostOf({ drawings })).toBeLessThanOrEqual(COMMAND_BURST);
  });

  it('a command past what the DTO admits can cost more than any bucket holds', () => {
    const drawings = Array.from({ length: 96 }, () => stroke(DRAWING_POINTS_MAX));

    expect(commandCostOf({ drawings })).toBeGreaterThan(COMMAND_BURST);
  });

  it('counts wide payloads of objects, not only freehand points', () => {
    const moves = Array.from({ length: 8000 }, () => ({ tokenId: 'x' }));

    expect(commandCostOf({ moves })).toBe(3);
  });

  it.each([null, undefined, 7, 'x', true])('%s costs one token', (payload) => {
    expect(commandCostOf(payload)).toBe(1);
  });

  it('survives a payload nested far deeper than the call stack', () => {
    let nested: unknown = [];
    for (let depth = 0; depth < 200_000; depth += 1) nested = [nested];

    expect(commandCostOf(nested)).toBeGreaterThan(COMMAND_BURST);
  });

  it('stops counting once no bucket could admit it', () => {
    const huge = { drawings: Array.from({ length: 2_000_000 }, () => ({})) };
    const startedAt = performance.now();

    expect(commandCostOf(huge)).toBe(COMMAND_BURST + 2);
    expect(performance.now() - startedAt).toBeLessThan(200);
  });
});
