import { describe, expect, it } from 'vitest';
import { boardAdvancedDto } from '../../src/board/board-event.dto';
import { BOARD_EVENTS, boardStateDto } from '../../src/board/board.dto';
import { veiledLightDto } from '../../src/board/light.dto';
import { tokenDto } from '../../src/board/token.dto';
import { newTokenDto } from '../../src/board/token-group.dto';
import {
  setTokensHiddenCommandDto,
  tokensHiddenChangedDto,
  veiledLightsChangedDto,
} from '../../src/board/token-hidden.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const SCENE_ID = '9c8b7a6d-5e4f-4a3b-9c1d-0e9f8a7b6c5d';
const WOLF_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const SHADE_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const AT = '2026-10-24T12:00:00.000Z';
const BASE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID };
const EVENT = { campaignId: CAMPAIGN_ID, sceneId: SCENE_ID, version: 7, at: AT };
const TORCH = { x: 4, y: 5, bright: 4, dim: 4, color: 'torch', facing: 0, angle: 360 };
const WOLF = {
  id: WOLF_ID,
  name: 'Lobo',
  initials: 'LO',
  side: 'enemy',
  width: 2,
  height: 2,
  col: 3,
  row: 4,
  layer: 'tokens',
  controllerIds: [],
  imageAssetId: null,
  frame: 'square',
  flipX: false,
  flipY: false,
  facing: 0,
  defeated: false,
  sightAngle: 360,
  sight: null,
  light: null,
  lightLit: true,
  aura: null,
  hidden: true,
  canControl: true,
  bars: [],
  conditions: [],
  anchorTokenId: null,
  createdBy: null,
  forms: [],
  activeFormId: null,
};
const STATE = {
  campaignId: CAMPAIGN_ID,
  version: 0,
  at: AT,
  viewer: { userId: SHADE_ID, role: 'player' },
  scene: {
    id: SCENE_ID,
    name: 'Cena 1',
    widthCells: 20,
    heightCells: 12,
    cellDistance: 1.5,
    cellUnit: 'm',
    gridVisible: true,
    gridOpacity: 30,
    background: null,
    vision: 'off',
  },
  tokens: [],
  drawings: [],
  effectAreas: [],
  walls: [],
  lights: [],
  veiledLights: [TORCH],
  combat: null,
  conditionDefinitions: [],
  mainTokens: [],
  memberCards: [],
};

describe('setTokensHiddenCommandDto', () => {
  it('two distinct tokens to hide are accepted as sent, on the group grid or an addressed one', () => {
    const command = { ...BASE, tokenIds: [WOLF_ID, SHADE_ID], hidden: true };
    expect(setTokensHiddenCommandDto.parse(command)).toEqual(command);
    const addressed = { ...command, sceneId: SCENE_ID };
    expect(setTokensHiddenCommandDto.parse(addressed)).toEqual(addressed);
  });

  it('the same token twice is refused, naming it', () => {
    const result = setTokensHiddenCommandDto.safeParse({
      ...BASE,
      tokenIds: [WOLF_ID, WOLF_ID],
      hidden: true,
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      `token ${WOLF_ID} appears more than once; expected distinct token ids`,
    ]);
  });

  it.each([
    ['no token', { ...BASE, tokenIds: [], hidden: true }],
    ['a forged userId', { ...BASE, tokenIds: [WOLF_ID], hidden: true, userId: SHADE_ID }],
    ['a hidden that is not a boolean', { ...BASE, tokenIds: [WOLF_ID], hidden: 'yes' }],
    ['no hidden', { ...BASE, tokenIds: [WOLF_ID] }],
  ])('%s is refused', (_case, command) => {
    expect(setTokensHiddenCommandDto.safeParse(command).success).toBe(false);
  });
});

describe('tokenDto.hidden', () => {
  it('a hidden token is accepted as sent', () => {
    expect(tokenDto.parse(WOLF).hidden).toBe(true);
  });

  it('a token without hidden is refused: the server always says it', () => {
    expect(tokenDto.safeParse({ ...WOLF, hidden: undefined }).success).toBe(false);
  });
});

describe('newTokenDto.hidden', () => {
  const pasted = {
    name: 'Lobo',
    initials: 'LO',
    side: 'enemy',
    width: 1,
    height: 1,
    controllerIds: [],
    col: 2,
    row: 2,
    bars: [],
  };

  it('a pasted token without hidden is born visible', () => {
    expect(newTokenDto.parse(pasted).hidden).toBe(false);
  });

  it('a pasted copy of a hidden token keeps it hidden', () => {
    expect(newTokenDto.parse({ ...pasted, hidden: true }).hidden).toBe(true);
  });
});

describe('the hidden-token events', () => {
  it('token:hiddenChanged carries the ids and the new state', () => {
    const event = { ...EVENT, tokenIds: [WOLF_ID], hidden: true };
    expect(tokensHiddenChangedDto.parse(event)).toEqual(event);
  });

  it('token:veiledLightsChanged carries the whole list without a version', () => {
    const event = { campaignId: CAMPAIGN_ID, sceneId: SCENE_ID, at: AT, lights: [TORCH] };
    expect(veiledLightsChangedDto.parse(event)).toEqual(event);
    expect(veiledLightsChangedDto.safeParse({ ...event, version: 7 }).success).toBe(false);
  });

  it('board:advanced is the version alone', () => {
    expect(boardAdvancedDto.parse(EVENT)).toEqual(EVENT);
    expect(boardAdvancedDto.safeParse({ ...EVENT, version: undefined }).success).toBe(false);
    expect(boardAdvancedDto.safeParse({ ...EVENT, tokenId: WOLF_ID }).success).toBe(false);
  });

  it('the names are in BOARD_EVENTS', () => {
    expect(BOARD_EVENTS.setTokensHidden).toBe('token:setHiddenMany');
    expect(BOARD_EVENTS.tokensHiddenChanged).toBe('token:hiddenChanged');
    expect(BOARD_EVENTS.veiledLightsChanged).toBe('token:veiledLightsChanged');
    expect(BOARD_EVENTS.boardAdvanced).toBe('board:advanced');
  });
});

describe('veiledLightDto', () => {
  it('a lit light of a hidden token is accepted as sent', () => {
    expect(veiledLightDto.parse(TORCH)).toEqual(TORCH);
  });

  it.each([
    ['a bright past the reach', { ...TORCH, bright: 101 }],
    ['the token id', { ...TORCH, tokenId: WOLF_ID }],
    ['no color field', { x: 4, y: 5, bright: 4, dim: 4, facing: 0, angle: 360 }],
  ])('%s is refused', (_case, light) => {
    expect(veiledLightDto.safeParse(light).success).toBe(false);
  });
});

describe('boardStateDto.veiledLights', () => {
  it('a snapshot with veiled lights is accepted as sent', () => {
    expect(boardStateDto.parse(STATE)).toEqual(STATE);
  });

  it('a snapshot without veiledLights is refused', () => {
    expect(boardStateDto.safeParse({ ...STATE, veiledLights: undefined }).success).toBe(false);
  });
});
