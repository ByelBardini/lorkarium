import { describe, expect, it } from 'vitest';
import { cell, tokenPatrol, type TokenPatrol } from '@lorkarium/game-core';
import {
  TokenPatrolBo,
  patrolPoseNowOf,
  type PatrolTimeline,
  type PatrolledToken,
} from '../../../src/modules/tokens/token-patrol.bo';

const STARTED = new Date('2026-11-08T12:00:00.000Z');
const SCENE = { widthCells: 20, heightCells: 12 };

function at(ms: number): Date {
  return new Date(STARTED.getTime() + ms);
}

function square(overrides: Partial<TokenPatrol> = {}): TokenPatrol {
  const path = [cell(0, 0), cell(2, 0), cell(2, 2), cell(0, 2)];
  return tokenPatrol({ path, repeat: 'loop', speed: 1, turns: true, ...overrides });
}

function timelineOf(overrides: Partial<PatrolTimeline> = {}): PatrolTimeline {
  return { patrol: square(), step: 0, startedAt: STARTED, ...overrides };
}

function kael(overrides: Partial<PatrolledToken> = {}): PatrolledToken {
  return {
    tokenId: 'kael',
    pose: { col: 0, row: 0, facing: 90 },
    size: { width: 1, height: 1 },
    timeline: timelineOf(),
    ...overrides,
  };
}

const rule = new TokenPatrolBo({ scene: SCENE, runningLimit: 30 });

describe('patrolPoseNowOf', () => {
  it('a running square at 1 cell/s stands on (2, 0) looking right at step 2 after 2.5 s', () => {
    expect(patrolPoseNowOf(kael(), at(2500))).toEqual({
      pose: { col: 2, row: 0, facing: 0 },
      step: 2,
    });
  });

  it('a paused patrol leaves the stored pose and the stored step', () => {
    const paused = kael({ timeline: timelineOf({ step: 3, startedAt: null }) });

    expect(patrolPoseNowOf(paused, at(2500))).toEqual({
      pose: { col: 0, row: 0, facing: 90 },
      step: 3,
    });
  });

  it('walking back to the route keeps the stored step', () => {
    const away = kael({ pose: { col: 5, row: 5, facing: 90 } });

    expect(patrolPoseNowOf(away, at(3000))).toEqual({
      pose: { col: 2, row: 2, facing: 225 },
      step: 0,
    });
  });

  it('a patrol that does not turn keeps the stored facing', () => {
    const still = kael({ timeline: timelineOf({ patrol: square({ turns: false }) }) });

    expect(patrolPoseNowOf(still, at(2500)).pose).toEqual({ col: 2, row: 0, facing: 90 });
  });
});

describe('TokenPatrolBo.save', () => {
  it('a new route on a paused token starts paused at step 0 where it stands', () => {
    const paused = kael({ timeline: timelineOf({ step: 5, startedAt: null }) });
    const route = square({ speed: 2 });

    expect(rule.save(paused, route, at(2500))).toEqual({
      tokenId: 'kael',
      timeline: { patrol: route, step: 0, startedAt: null },
      pose: { col: 0, row: 0, facing: 90 },
    });
  });

  it('a new route over a running patrol pauses where it is now and starts again at step 0', () => {
    const write = rule.save(kael(), square(), at(2500));

    expect(write.pose).toEqual({ col: 2, row: 0, facing: 0 });
    expect(write.timeline).toMatchObject({ step: 0, startedAt: at(2500) });
  });

  it('a route with a point out of the scene for a 2×2 token is OUT_OF_SCENE citing it', () => {
    const big = kael({ size: { width: 2, height: 2 }, timeline: null });
    const route = tokenPatrol({
      path: [cell(0, 0), cell(19, 0)],
      repeat: 'bounce',
      speed: 1,
      turns: true,
    });

    expect(() => rule.save(big, route, at(0))).toThrow(
      expect.objectContaining({
        code: 'OUT_OF_SCENE',
        message: 'a token at (19, 0) of size 2×2 does not fit the 20×12 scene',
      }),
    );
  });

  it('touching the edge fits (18 + 2 = 20)', () => {
    const big = kael({ size: { width: 2, height: 2 }, timeline: null });
    const route = tokenPatrol({
      path: [cell(0, 0), cell(18, 0)],
      repeat: 'bounce',
      speed: 1,
      turns: true,
    });

    expect(rule.save(big, route, at(0)).timeline?.patrol).toBe(route);
  });
});

describe('TokenPatrolBo.remove', () => {
  it('taking a running patrol away leaves the token where it is now', () => {
    expect(rule.remove(kael(), at(2500))).toEqual({
      tokenId: 'kael',
      timeline: null,
      pose: { col: 2, row: 0, facing: 0 },
    });
  });

  it('taking a paused patrol away keeps the stored pose', () => {
    const paused = kael({ timeline: timelineOf({ startedAt: null }) });

    expect(rule.remove(paused, at(2500)).pose).toEqual({ col: 0, row: 0, facing: 90 });
  });
});

describe('TokenPatrolBo.start', () => {
  const paused = (tokenId: string): PatrolledToken =>
    kael({ tokenId, timeline: timelineOf({ step: 2, startedAt: null }) });

  it('two paused patrols start at now from the step each stopped, in the stored pose', () => {
    const writes = rule.start([paused('kael'), paused('lyra')], 0, at(900));

    expect(
      writes.map(({ tokenId, timeline }) => [tokenId, timeline?.startedAt, timeline?.step]),
    ).toEqual([
      ['kael', at(900), 2],
      ['lyra', at(900), 2],
    ]);
    expect(writes[0]?.pose).toEqual({ col: 0, row: 0, facing: 90 });
  });

  it('a patrol already running is left out', () => {
    expect(rule.start([kael(), paused('lyra')], 1, at(900)).map(({ tokenId }) => tokenId)).toEqual([
      'lyra',
    ]);
  });

  it('a token without a route is TOKEN_PATROL_NOT_FOUND citing it, and none starts', () => {
    const ogro = kael({ tokenId: 'ogro', timeline: null });

    expect(() => rule.start([paused('kael'), ogro], 0, at(0))).toThrow(
      expect.objectContaining({
        code: 'TOKEN_PATROL_NOT_FOUND',
        message: 'token ogro has no patrol; expected a token with a patrol route saved',
      }),
    );
  });

  it('29 running + 2 started is TOKEN_PATROL_LIMIT with the count and the limit', () => {
    expect(() => rule.start([paused('kael'), paused('lyra')], 29, at(0))).toThrow(
      expect.objectContaining({
        code: 'TOKEN_PATROL_LIMIT',
        message:
          'the scene would have 31 running patrols (29 running + 2 started); the limit is 30',
      }),
    );
  });

  it('exactly the limit starts (28 running + 2)', () => {
    expect(rule.start([paused('kael'), paused('lyra')], 28, at(0))).toHaveLength(2);
  });

  it('a route that no longer fits the grown token is OUT_OF_SCENE', () => {
    const small = new TokenPatrolBo({ scene: { widthCells: 3, heightCells: 3 }, runningLimit: 30 });
    const grown = { ...paused('kael'), size: { width: 2, height: 2 } };

    expect(() => small.start([grown], 0, at(0))).toThrow(
      expect.objectContaining({ code: 'OUT_OF_SCENE', message: expect.stringContaining('(2, 0)') }),
    );
  });
});

describe('TokenPatrolBo.pause', () => {
  it('a running patrol pauses where it is now with the step to resume from', () => {
    expect(rule.pause([kael()], at(2500))).toEqual([
      {
        tokenId: 'kael',
        pose: { col: 2, row: 0, facing: 0 },
        timeline: { patrol: square(), step: 2, startedAt: null },
      },
    ]);
  });

  it('paused patrols and tokens without one are left out', () => {
    const paused = kael({ tokenId: 'lyra', timeline: timelineOf({ startedAt: null }) });
    const none = kael({ tokenId: 'ogro', timeline: null });

    expect(rule.pause([paused, none], at(2500))).toEqual([]);
  });

  it('pausing on the walk back keeps the step and stands on the cell of the walk', () => {
    const away = kael({ pose: { col: 5, row: 5, facing: 90 }, timeline: timelineOf({ step: 3 }) });

    const [write] = rule.pause([away], at(1000));

    expect(write?.pose).toMatchObject({ col: 4, row: 4 });
    expect(write?.timeline?.step).toBe(3);
  });
});
