import { describe, expect, it } from 'vitest';
import {
  activateSceneCommandDto,
  boardCommandAckDto,
  boardCommandDto,
  boardStateDto,
  boardSyncAckDto,
  sceneActivateAckDto,
  sceneUnwatchAckDto,
  sceneUpdatedDto,
  watchSceneCommandDto,
} from '../../src/board/board.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const USER_ID = '6a1d2c3b-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const AT = '2026-10-15T12:00:00.000Z';
const SCENE = {
  id: '9c8b7a6d-5e4f-4a3b-9c1d-0e9f8a7b6c5d',
  name: 'Cena 1',
  widthCells: 20,
  heightCells: 12,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 30,
  background: null,
  vision: 'off',
};
const STATE = {
  campaignId: CAMPAIGN_ID,
  version: 0,
  at: AT,
  viewer: { userId: USER_ID, role: 'player' },
  scene: SCENE,
  tokens: [],
  drawings: [],
  effectAreas: [],
  walls: [],
  lights: [],
  combat: null,
  conditionDefinitions: [],
  mainTokens: [],
  memberCards: [],
};

describe('boardStateDto', () => {
  it('a snapshot of an empty scene out of combat is accepted as sent', () => {
    expect(boardStateDto.parse(STATE)).toEqual(STATE);
  });

  it('a negative version is refused on version', () => {
    const result = boardStateDto.safeParse({ ...STATE, version: -1 });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['version']);
  });

  it('a snapshot without lights is refused on lights', () => {
    const result = boardStateDto.safeParse({ ...STATE, lights: undefined });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['lights']);
  });

  it('a snapshot without effectAreas is refused on effectAreas', () => {
    const result = boardStateDto.safeParse({ ...STATE, effectAreas: undefined });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['effectAreas']);
  });

  it('a viewer role outside master or player is refused on viewer.role', () => {
    const result = boardStateDto.safeParse({
      ...STATE,
      viewer: { userId: USER_ID, role: 'admin' },
    });
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['viewer.role']);
  });
});

describe('boardCommandDto', () => {
  it('a board:sync carrying a forged userId is refused', () => {
    const forged = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, userId: USER_ID };
    expect(boardCommandDto.safeParse(forged).success).toBe(false);
  });

  it('a board:sync naming the grid it wants keeps the sceneId', () => {
    const addressed = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, sceneId: SCENE.id };
    expect(boardCommandDto.parse(addressed)).toEqual(addressed);
  });

  it('a sceneId that is not a uuid is refused, citing the field', () => {
    const malformed = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, sceneId: 'torre' };
    expect(boardCommandDto.safeParse(malformed).error?.issues[0]?.path).toEqual(['sceneId']);
  });
});

describe('board acks', () => {
  it('a sync ack carries the snapshot', () => {
    expect(boardSyncAckDto.parse({ ok: true, state: STATE })).toEqual({ ok: true, state: STATE });
  });

  it('a command ack carries the new version', () => {
    expect(boardCommandAckDto.parse({ ok: true, version: 4 })).toEqual({ ok: true, version: 4 });
  });

  it('a creating command ack also carries the ids the server gave, in the order sent', () => {
    const createdIds = [
      '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
      '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b',
    ];

    expect(boardCommandAckDto.parse({ ok: true, version: 4, createdIds })).toEqual({
      ok: true,
      version: 4,
      createdIds,
    });
  });

  it('a created id that is not a uuid is refused', () => {
    expect(boardCommandAckDto.safeParse({ ok: true, version: 4, createdIds: ['x'] }).success).toBe(
      false,
    );
  });

  it('a failure whose error is not an ApiErrorDto is refused', () => {
    expect(boardCommandAckDto.safeParse({ ok: false, error: 'FORBIDDEN' }).success).toBe(false);
    expect(boardSyncAckDto.safeParse({ ok: false, error: { code: 'X' } }).success).toBe(false);
  });
});

describe('sceneUpdatedDto', () => {
  it('a scene:updated without the grid is refused on sceneId (every event names its grid)', () => {
    const withoutGrid = { campaignId: CAMPAIGN_ID, version: 5, at: AT, scene: SCENE };
    expect(sceneUpdatedDto.safeParse(withoutGrid).error?.issues[0]?.path).toEqual(['sceneId']);
  });

  it('a scene:updated names the grid it happened on in sceneId', () => {
    const event = { campaignId: CAMPAIGN_ID, sceneId: SCENE.id, version: 5, at: AT, scene: SCENE };
    expect(sceneUpdatedDto.parse(event)).toEqual(event);
  });
});

describe('watchSceneCommandDto', () => {
  const WATCH = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, sceneId: SCENE.id };

  it('a scene:watch names the table and the grid to open as a tab', () => {
    expect(watchSceneCommandDto.parse(WATCH)).toEqual(WATCH);
  });

  it('a scene:watch without the grid is refused on sceneId', () => {
    const withoutGrid = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };
    expect(watchSceneCommandDto.safeParse(withoutGrid).error?.issues[0]?.path).toEqual(['sceneId']);
  });

  it('a scene:watch carrying a forged userId is refused', () => {
    expect(watchSceneCommandDto.safeParse({ ...WATCH, userId: USER_ID }).success).toBe(false);
  });

  it('the scene:unwatch ack is a bare ok or the API error', () => {
    expect(sceneUnwatchAckDto.parse({ ok: true })).toEqual({ ok: true });
    expect(sceneUnwatchAckDto.safeParse({ ok: true, version: 1 }).success).toBe(false);
  });
});

describe('activateSceneCommandDto', () => {
  const ACTIVATE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, sceneId: SCENE.id };

  it('a scene:activate names the table and the grid the group goes to', () => {
    expect(activateSceneCommandDto.parse(ACTIVATE)).toEqual(ACTIVATE);
  });

  it('a scene:activate without the grid is refused on sceneId', () => {
    const withoutGrid = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };
    const result = activateSceneCommandDto.safeParse(withoutGrid);
    expect(result.error?.issues[0]?.path).toEqual(['sceneId']);
  });

  it('a scene:activate carrying a forged userId is refused', () => {
    expect(activateSceneCommandDto.safeParse({ ...ACTIVATE, userId: USER_ID }).success).toBe(false);
  });

  it('the scene:activate ack is a bare ok, without a version', () => {
    expect(sceneActivateAckDto.parse({ ok: true })).toEqual({ ok: true });
    expect(sceneActivateAckDto.safeParse({ ok: true, version: 1 }).success).toBe(false);
  });
});
