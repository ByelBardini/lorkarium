import { describe, expect, it } from 'vitest';
import { configureSceneCommandDto, sceneGridDto } from '../../src/board/scene.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const GRID = {
  widthCells: 30,
  heightCells: 20,
  cellDistance: 1.5,
  cellUnit: 'm',
  gridVisible: true,
  gridOpacity: 15,
};
const COMMAND = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, ...GRID };

function issuePathsOf(input: unknown): string[] {
  const result = configureSceneCommandDto.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => [...issue.path, ...keysOf(issue)].join('.'));
}

function keysOf(issue: object): string[] {
  return 'keys' in issue && Array.isArray(issue.keys) ? issue.keys : [];
}

describe('configureSceneCommandDto', () => {
  it('a 30×20 grid of 1.5 m cells at 15% opacity is accepted as sent', () => {
    expect(configureSceneCommandDto.parse(COMMAND)).toEqual(COMMAND);
  });

  it('a background asset id or null (take it away) is accepted as sent', () => {
    const backgroundAssetId = '7f6e5d4c-3b2a-4f1e-8d9c-8b7a6f5e4d3c';

    expect(configureSceneCommandDto.parse({ ...COMMAND, backgroundAssetId })).toMatchObject({
      backgroundAssetId,
    });
    expect(issuePathsOf({ ...COMMAND, backgroundAssetId: null })).toEqual([]);
  });

  it('a configure addressed to a grid other than the group one keeps its sceneId', () => {
    const sceneId = '9c8b7a6d-5e4f-4a3b-9c1d-0e9f8a7b6c5d';
    expect(configureSceneCommandDto.parse({ ...COMMAND, sceneId })).toMatchObject({ sceneId });
  });

  it('a background that is not an asset id is refused on backgroundAssetId', () => {
    expect(issuePathsOf({ ...COMMAND, backgroundAssetId: 'mapa.png' })).toEqual([
      'backgroundAssetId',
    ]);
  });

  it.each([1, 100])('%s cells wide is accepted', (widthCells) => {
    expect(issuePathsOf({ ...COMMAND, widthCells })).toEqual([]);
  });

  it.each([0, 101, 2.5])('%s cells wide is refused on widthCells', (widthCells) => {
    expect(issuePathsOf({ ...COMMAND, widthCells })).toEqual(['widthCells']);
  });

  it.each([0, 101])('%s cells high is refused on heightCells', (heightCells) => {
    expect(issuePathsOf({ ...COMMAND, heightCells })).toEqual(['heightCells']);
  });

  it('a unit of 8 characters passes and one of 9 is refused on cellUnit', () => {
    expect(issuePathsOf({ ...COMMAND, cellUnit: 'quadrado' })).toEqual([]);
    expect(issuePathsOf({ ...COMMAND, cellUnit: 'quadrados' })).toEqual(['cellUnit']);
  });

  it('a unit padded with spaces is trimmed, and a blank one is refused', () => {
    expect(configureSceneCommandDto.parse({ ...COMMAND, cellUnit: '  m ' }).cellUnit).toBe('m');
    expect(issuePathsOf({ ...COMMAND, cellUnit: '   ' })).toEqual(['cellUnit']);
  });

  it.each([0, -1.5])('a cell distance of %s is refused on cellDistance', (cellDistance) => {
    expect(issuePathsOf({ ...COMMAND, cellDistance })).toEqual(['cellDistance']);
  });

  it.each([0, 100])('opacity %s is accepted', (gridOpacity) => {
    expect(issuePathsOf({ ...COMMAND, gridOpacity })).toEqual([]);
  });

  it.each([-1, 101, 50.5])('opacity %s is refused on gridOpacity', (gridOpacity) => {
    expect(issuePathsOf({ ...COMMAND, gridOpacity })).toEqual(['gridOpacity']);
  });

  it('a forged userId is refused on the userId key', () => {
    expect(issuePathsOf({ ...COMMAND, userId: ACTION_ID })).toEqual(['userId']);
  });
});

describe('sceneGridDto', () => {
  it('the grid alone is accepted without the command envelope', () => {
    expect(sceneGridDto.parse(GRID)).toEqual(GRID);
  });

  it('a grid carrying the campaign id is refused (strict)', () => {
    expect(sceneGridDto.safeParse({ ...GRID, campaignId: CAMPAIGN_ID }).success).toBe(false);
  });
});

describe('configureSceneCommandDto vision', () => {
  it.each(['off', 'dark', 'daylight'])('the vision %s is accepted', (vision) => {
    expect(configureSceneCommandDto.parse({ ...COMMAND, vision }).vision).toBe(vision);
  });

  it('the vision "dusk" is refused on vision', () => {
    expect(issuePathsOf({ ...COMMAND, vision: 'dusk' })).toEqual(['vision']);
  });

  it('a command without vision is accepted (the scene keeps its mode)', () => {
    expect(issuePathsOf(COMMAND)).toEqual([]);
  });
});
