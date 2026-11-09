import { describe, expect, it } from 'vitest';
import {
  WALL_CHECKS_PER_COMMAND_MAX,
  doorSightChecks,
  requireWallChecks,
} from '../../../src/modules/walls/wall-checks.bo';

describe('requireWallChecks', () => {
  it('the budget itself passes', () => {
    expect(() => requireWallChecks(WALL_CHECKS_PER_COMMAND_MAX)).not.toThrow();
  });

  it('one past it is WALL_CHECKS_EXCEEDED citing the value and the limit', () => {
    expect(() => requireWallChecks(WALL_CHECKS_PER_COMMAND_MAX + 1)).toThrow(
      expect.objectContaining({
        code: 'WALL_CHECKS_EXCEEDED',
        message: expect.stringMatching(/1000001.*1000000/),
      }),
    );
  });
});

describe('doorSightChecks', () => {
  it('the documented stress scale fits the budget', () => {
    const checks = doorSightChecks({ eyes: 16, lights: 40, segments: 4000 });

    expect(checks).toBe(672_000);
    expect(checks).toBeLessThanOrEqual(WALL_CHECKS_PER_COMMAND_MAX);
  });

  it('the measured attack does not', () => {
    expect(doorSightChecks({ eyes: 500, lights: 600, segments: 4000 })).toBeGreaterThan(
      WALL_CHECKS_PER_COMMAND_MAX,
    );
  });
});
