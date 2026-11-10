import { describe, expect, it } from 'vitest';
import { BOARD_EVENTS } from '../../src/board/board.dto';
import { combatStartedDto } from '../../src/board/combat.dto';
import { tokensFacedDto } from '../../src/board/token-appearance.dto';
import { tokenMovedDto } from '../../src/board/token.dto';
import {
  setTokenPatrolCommandDto,
  setTokenPatrolsActiveCommandDto,
  TOKEN_PATROL_POINTS_MAX,
  tokenPatrolsChangedDto,
} from '../../src/board/token-patrol.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const SCENE_ID = '9c8b7a6d-5e4f-4a3b-9c1d-0e9f8a7b6c5d';
const KAEL_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const LYRA_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const OGRE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const BIA_ID = 'b7c6d5e4-f3a2-4b1c-9d8e-7f6a5b4c3d2e';
const AT = '2026-11-08T12:00:00.000Z';
const BASE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };
const EVENT = { campaignId: CAMPAIGN_ID, sceneId: SCENE_ID, version: 9, at: AT };
const CORRIDOR = {
  path: [
    [0, 0],
    [3, 0],
  ],
  repeat: 'bounce',
  speed: 1.5,
  turns: true,
  gait: 'glide',
};
const KAEL_PAUSE = { tokenId: KAEL_ID, col: 2, row: 0, facing: 0, step: 2 };

function routeOf(points: number): number[][] {
  return Array.from({ length: points }, (_, index) => [index, 0]);
}

function patrolMessagesOf(patrol: unknown): string[] {
  const result = setTokenPatrolCommandDto.safeParse({ ...BASE, tokenId: KAEL_ID, patrol });
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('setTokenPatrolCommandDto', () => {
  it('a corridor route walked back and forth at 1.5 cells per second is accepted as sent', () => {
    const command = { ...BASE, tokenId: KAEL_ID, patrol: CORRIDOR };

    expect(setTokenPatrolCommandDto.parse(command)).toEqual(command);
  });

  it('a route walked cell by cell (gait step) is accepted', () => {
    expect(patrolMessagesOf({ ...CORRIDOR, gait: 'step' })).toEqual([]);
  });

  it('a gait other than glide or step is refused', () => {
    expect(patrolMessagesOf({ ...CORRIDOR, gait: 'teleport' })).toHaveLength(1);
  });

  it('a route without a gait is refused', () => {
    expect(patrolMessagesOf({ ...CORRIDOR, gait: undefined })).toHaveLength(1);
  });

  it('patrol null (taking the route away) is accepted', () => {
    const command = { ...BASE, tokenId: KAEL_ID, patrol: null };

    expect(setTokenPatrolCommandDto.parse(command)).toEqual(command);
  });

  it('a route of 32 points is accepted', () => {
    expect(patrolMessagesOf({ ...CORRIDOR, path: routeOf(TOKEN_PATROL_POINTS_MAX) })).toEqual([]);
  });

  it.each([0.25, 4])('a speed of %s cells per second is accepted', (speed) => {
    expect(patrolMessagesOf({ ...CORRIDOR, speed })).toEqual([]);
  });

  it.each([33, 1])('a route of %s points is refused citing the count and 2 to 32', (points) => {
    expect(patrolMessagesOf({ ...CORRIDOR, path: routeOf(points) })).toEqual([
      `patrol path has ${points} points; expected 2 to 32`,
    ]);
  });

  it.each([0.3, 4.25, 0, Number.NaN])(
    'a speed of %s is refused citing the value and the steps of 0.25',
    (speed) => {
      expect(patrolMessagesOf({ ...CORRIDOR, speed })).toEqual([
        `patrol speed ${speed} is invalid; expected 0.25 to 4 in steps of 0.25`,
      ]);
    },
  );

  it('a point at 1.01 is refused by the 1/64 step', () => {
    expect(
      patrolMessagesOf({
        ...CORRIDOR,
        path: [
          [0, 0],
          [1.01, 0],
        ],
      }),
    ).toEqual([expect.stringContaining('cell 1.01 is invalid')]);
  });

  it('a forged userId is refused (who asks comes from the connection)', () => {
    const result = setTokenPatrolCommandDto.safeParse({
      ...BASE,
      tokenId: KAEL_ID,
      patrol: CORRIDOR,
      userId: BIA_ID,
    });

    expect(result.error?.issues.map((issue) => issue.code)).toEqual(['unrecognized_keys']);
  });
});

describe('setTokenPatrolsActiveCommandDto', () => {
  it('three tokens started at once are accepted as sent', () => {
    const command = { ...BASE, tokenIds: [KAEL_ID, LYRA_ID, OGRE_ID], active: true };

    expect(setTokenPatrolsActiveCommandDto.parse(command)).toEqual(command);
  });

  it('an empty list of tokens is refused', () => {
    expect(
      setTokenPatrolsActiveCommandDto.safeParse({ ...BASE, tokenIds: [], active: false }).success,
    ).toBe(false);
  });
});

describe('tokenPatrolsChangedDto', () => {
  it('a started patrol with the pose saved is accepted as sent', () => {
    const event = {
      ...EVENT,
      changes: [
        {
          tokenId: KAEL_ID,
          patrol: { ...CORRIDOR, step: 0, startedAt: AT },
          col: 4,
          row: 4,
          facing: 90,
        },
        { tokenId: LYRA_ID, patrol: null, col: 1, row: 1, facing: 0 },
      ],
    };

    expect(tokenPatrolsChangedDto.parse(event)).toEqual(event);
  });

  it('a patrol with a negative step is refused', () => {
    const change = { tokenId: KAEL_ID, patrol: { ...CORRIDOR, step: -1, startedAt: null } };

    expect(
      tokenPatrolsChangedDto.safeParse({
        ...EVENT,
        changes: [{ ...change, col: 0, row: 0, facing: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe('patrolPausesShape', () => {
  const moved = { ...EVENT, tokenId: KAEL_ID, col: 2, row: 0 };

  it('token:moved carries the pause of the patrol it stopped', () => {
    const event = { ...moved, patrolPauses: [KAEL_PAUSE] };

    expect(tokenMovedDto.parse(event)).toEqual(event);
  });

  it('token:moved without patrolPauses stays the event it always was', () => {
    expect(tokenMovedDto.parse(moved)).toEqual(moved);
  });

  it('a pause with a negative step is refused', () => {
    const event = { ...moved, patrolPauses: [{ ...KAEL_PAUSE, step: -1 }] };

    expect(tokenMovedDto.safeParse(event).error?.issues.map((issue) => issue.path)).toEqual([
      ['patrolPauses', 0, 'step'],
    ]);
  });

  it('token:facedMany and combat:started carry the pauses too', () => {
    const faced = {
      ...EVENT,
      faces: [{ tokenId: KAEL_ID, facing: 0 }],
      patrolPauses: [KAEL_PAUSE],
    };
    const combat = { id: OGRE_ID, round: 1, currentCombatantId: null, combatants: [] };
    const started = { ...EVENT, combat, patrolPauses: [KAEL_PAUSE] };

    expect(tokensFacedDto.parse(faced)).toEqual(faced);
    expect(combatStartedDto.parse(started)).toEqual(started);
  });
});

describe('BOARD_EVENTS', () => {
  it('names the two patrol commands and the patrol event', () => {
    expect([
      BOARD_EVENTS.setTokenPatrol,
      BOARD_EVENTS.setTokenPatrolsActive,
      BOARD_EVENTS.tokenPatrolsChanged,
    ]).toEqual(['token:setPatrol', 'token:setPatrolActiveMany', 'token:patrolsChanged']);
  });
});
