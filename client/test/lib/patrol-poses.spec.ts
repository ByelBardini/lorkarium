import { describe, expect, it } from 'vitest';
import { IDLE_PATROLS, patrolClockOf, posedTokenOf, type PatrolClock } from '@/lib/patrol-poses';
import { veiledTorch } from '../support/light-fixtures';
import { PATROL_STARTED_AT, squarePatrol } from '../support/patrol-fixtures';
import { KAEL_ID, kael, lyra } from '../support/table-session-fixtures';

const STARTED_MS = Date.parse(PATROL_STARTED_AT);
const RUNNING = squarePatrol({ startedAt: PATROL_STARTED_AT });
const KAEL_ON_PATROL = kael({ col: 0, row: 0, facing: 90, patrol: RUNNING });

function clockAt(elapsedMs: number, tokens = [KAEL_ON_PATROL, lyra()], previous = IDLE_PATROLS) {
  return patrolClockOf({ tokens, veiledLights: [], serverNowMs: STARTED_MS + elapsedMs }, previous);
}

describe('patrolClockOf', () => {
  it('2500 ms into a 1 cell/s square only Kael walks: at (2, 0), looking right, next step in 500', () => {
    const clock = clockAt(2500);

    expect(clock.poses).toEqual(new Map([[KAEL_ID, { col: 2, row: 0, facing: 0, glideMs: 1000 }]]));
    expect(clock.nextChangeInMs).toBe(500);
  });

  it('a patrol at 2 cells/s glides each step in 500 ms', () => {
    const fast = kael({
      col: 0,
      row: 0,
      patrol: squarePatrol({ speed: 2, startedAt: PATROL_STARTED_AT }),
    });

    expect(clockAt(1000, [fast]).poses.get(KAEL_ID)).toEqual({
      col: 2,
      row: 0,
      facing: 0,
      glideMs: 500,
    });
  });

  it('a patrol walked cell by cell keeps the cell and the timing, without the whole-step glide', () => {
    const stepping = kael({
      col: 0,
      row: 0,
      patrol: squarePatrol({ gait: 'step', startedAt: PATROL_STARTED_AT }),
    });

    const clock = clockAt(2500, [stepping]);

    expect(clock.poses.get(KAEL_ID)).toEqual({ col: 2, row: 0, facing: 0, glideMs: null });
    expect(clock.nextChangeInMs).toBe(500);
  });

  it('a paused patrol (no start) does not walk', () => {
    const paused = kael({ col: 0, row: 0, patrol: squarePatrol() });

    expect(clockAt(2500, [paused]).poses.size).toBe(0);
  });

  it('a patrol that does not turn leaves the facing to the token (null)', () => {
    const still = kael({
      col: 0,
      row: 0,
      patrol: squarePatrol({ turns: false, startedAt: PATROL_STARTED_AT }),
    });

    expect(clockAt(2500, [still]).poses.get(KAEL_ID)?.facing).toBeNull();
  });

  it('the next change is the nearest of every patrol (Lyra steps first at 4 cells/s)', () => {
    const quick = lyra({
      col: 0,
      row: 4,
      patrol: squarePatrol({
        path: [
          [0, 4],
          [3, 4],
        ],
        speed: 4,
        startedAt: PATROL_STARTED_AT,
      }),
    });

    expect(clockAt(2500, [KAEL_ON_PATROL, quick]).nextChangeInMs).toBe(250);
  });

  it('with no patrol running there is no next change and the very idle poses come back', () => {
    const clock = clockAt(2500, [lyra()]);

    expect(clock.nextChangeInMs).toBeNull();
    expect(clock.poses).toBe(IDLE_PATROLS.poses);
  });

  it('a pose equal to the previous one keeps the very map (the sight memo holds)', () => {
    const first = clockAt(2500);

    expect(clockAt(2900, undefined, first).poses).toBe(first.poses);
  });

  it('a step to a new cell hands a new map', () => {
    const first = clockAt(2500);

    expect(clockAt(3000, undefined, first).poses.get(KAEL_ID)).toMatchObject({ col: 2, row: 1 });
  });

  it('a step out of the cycle (a stray step from the server) leaves that token where it was saved', () => {
    const stray = kael({
      col: 0,
      row: 0,
      patrol: squarePatrol({ step: 8, startedAt: PATROL_STARTED_AT }),
    });

    expect(clockAt(2500, [stray]).poses.size).toBe(0);
  });
});

describe('patrolClockOf, the veiled light of a hidden patrol', () => {
  const walk = { patrol: RUNNING, col: 0, row: 0, width: 1, height: 1 };

  function veiledAt(elapsedMs: number, previous: PatrolClock = IDLE_PATROLS): PatrolClock {
    const veiledLights = [veiledTorch({ x: 0.5, y: 0.5, walk })];
    return patrolClockOf(
      { tokens: [], veiledLights, serverNowMs: STARTED_MS + elapsedMs },
      previous,
    );
  }

  it('walks with its token: at 2500 ms it shines from the center of (2, 0), turned right', () => {
    expect(veiledAt(2500).veiledLights).toEqual([veiledTorch({ x: 2.5, y: 0.5, facing: 0, walk })]);
  });

  it('counts in the next change like a token', () => {
    expect(veiledAt(2500).nextChangeInMs).toBe(500);
  });

  it('veiled lights that do not walk come back as the very array', () => {
    const veiledLights = [veiledTorch()];

    const clock = patrolClockOf(
      { tokens: [], veiledLights, serverNowMs: STARTED_MS },
      IDLE_PATROLS,
    );

    expect(clock.veiledLights).toBe(veiledLights);
  });

  it('a walked light still on the same cell keeps the previous array', () => {
    const first = veiledAt(2500);

    expect(veiledAt(2900, first).veiledLights).toBe(first.veiledLights);
  });
});

describe('posedTokenOf', () => {
  it('a token on patrol is read where it shows, with the patrol facing', () => {
    const poses = clockAt(2500).poses;

    expect(posedTokenOf(KAEL_ON_PATROL, poses)).toMatchObject({ col: 2, row: 0, facing: 0 });
  });

  it('a patrol that does not turn keeps the token facing', () => {
    const poses = new Map([[KAEL_ID, { col: 2, row: 0, facing: null, glideMs: 1000 }]]);

    expect(posedTokenOf(KAEL_ON_PATROL, poses)).toMatchObject({ col: 2, row: 0, facing: 90 });
  });

  it('a token with no pose comes back as itself', () => {
    const token = lyra();

    expect(posedTokenOf(token, clockAt(2500).poses)).toBe(token);
  });
});
