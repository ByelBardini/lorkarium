import { describe, expect, it } from 'vitest';
import { boardPingedDto, pingCommandDto } from '../../src/board/ping.dto';
import { SCENE_CELLS_MAX } from '../../src/board/scene.dto';

const ACTION_ID = '0f8b5b8e-1c1f-4d7c-9a51-6b3c2d1e0f9a';
const CAMPAIGN_ID = '3b9c1a7e-5d2f-4e8a-b6c4-1f0e9d8c7b6a';
const SCENE_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
const ANA_ID = '6e5d4c3b-2a1f-4e0d-9c8b-7a6f5e4d3c2b';
const BASE = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, sceneId: SCENE_ID };

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('pingCommandDto', () => {
  it('a fractional point inside the grid is accepted with the same values', () => {
    const command = { ...BASE, x: 3.42, y: 0 };

    expect(pingCommandDto.parse(command)).toEqual(command);
  });

  it.each([
    ['the origin', 0, 0],
    ['the far corner', SCENE_CELLS_MAX, SCENE_CELLS_MAX],
  ])('a point at %s is accepted', (_where, x, y) => {
    expect(pingCommandDto.safeParse({ ...BASE, x, y }).success).toBe(true);
  });

  it('x below zero is refused citing the field and the value', () => {
    const messages = messagesOf(pingCommandDto.safeParse({ ...BASE, x: -0.01, y: 1 }));

    expect(messages).toEqual([
      `ping x -0.01 is invalid; expected a finite number from 0 to ${SCENE_CELLS_MAX} cells`,
    ]);
  });

  it('y past the grid ceiling is refused', () => {
    const messages = messagesOf(
      pingCommandDto.safeParse({ ...BASE, x: 1, y: SCENE_CELLS_MAX + 1 }),
    );

    expect(messages).toEqual([
      `ping y 101 is invalid; expected a finite number from 0 to ${SCENE_CELLS_MAX} cells`,
    ]);
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('x as %s is refused citing it', (label, x) => {
    const messages = messagesOf(pingCommandDto.safeParse({ ...BASE, x, y: 1 }));

    expect(messages).toEqual([
      `ping x ${label} is invalid; expected a finite number from 0 to ${SCENE_CELLS_MAX} cells`,
    ]);
  });

  it('a ping without the grid is refused', () => {
    const withoutScene = { actionId: ACTION_ID, campaignId: CAMPAIGN_ID, x: 1, y: 1 };

    expect(pingCommandDto.safeParse(withoutScene).success).toBe(false);
  });

  it('a userId in the command is refused: who pings comes from the connection', () => {
    expect(pingCommandDto.safeParse({ ...BASE, x: 1, y: 1, userId: ANA_ID }).success).toBe(false);
  });
});

describe('boardPingedDto', () => {
  const EVENT = {
    campaignId: CAMPAIGN_ID,
    sceneId: SCENE_ID,
    userId: ANA_ID,
    x: 3.42,
    y: 1.5,
    at: '2026-10-24T12:00:00.000Z',
  };

  it('an event with who pinged, where and when is accepted', () => {
    expect(boardPingedDto.parse(EVENT)).toEqual(EVENT);
  });

  it('an event without userId is refused', () => {
    const withoutUser = { ...EVENT, userId: undefined };

    expect(boardPingedDto.safeParse(withoutUser).success).toBe(false);
  });

  it('an event with a version is refused: the ping changes no state', () => {
    expect(boardPingedDto.safeParse({ ...EVENT, version: 3 }).success).toBe(false);
  });
});
