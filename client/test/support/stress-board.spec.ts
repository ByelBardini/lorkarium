import { boardStateDto } from '@lorkarium/contracts';
import { wallSegments } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { gameWallOf } from '@/lib/wall-geometry';
import { STRESS_PLAYER_IDS, stressBoardOf } from './stress-board';

describe('stressBoardOf', () => {
  it('has the target size: 300 tokens, 300 walls, 40 lights on a dark 100 × 100 scene', () => {
    const board = stressBoardOf();
    expect(board.tokens).toHaveLength(300);
    expect(board.walls).toHaveLength(300);
    expect(board.lights).toHaveLength(40);
    expect(board.scene).toMatchObject({ widthCells: 100, heightCells: 100, vision: 'dark' });
  });

  it('adds up to about 900 wall segments, with doors, grates and curtains', () => {
    const { walls } = stressBoardOf();
    const segments = walls.flatMap((dto) => wallSegments(gameWallOf(dto)));
    expect(segments.length).toBeGreaterThanOrEqual(850);
    expect(segments.length).toBeLessThanOrEqual(950);
    expect(new Set(walls.map(({ kind }) => kind))).toEqual(
      new Set(['wall', 'door', 'grate', 'curtain']),
    );
  });

  it('gives each of the 8 players at least one token, the viewer being the first', () => {
    const board = stressBoardOf();
    expect(STRESS_PLAYER_IDS).toHaveLength(8);
    for (const playerId of STRESS_PLAYER_IDS) {
      expect(board.tokens.some(({ controllerIds }) => controllerIds.includes(playerId))).toBe(true);
    }
    expect(board.viewer).toEqual({ userId: STRESS_PLAYER_IDS[0], role: 'player' });
    const viewerTokens = board.tokens.filter(({ canControl }) => canControl);
    expect(
      viewerTokens.every(({ controllerIds }) => controllerIds.includes(board.viewer.userId)),
    ).toBe(true);
  });

  it('fits the scene: the contracts DTO accepts the snapshot', () => {
    expect(boardStateDto.safeParse(stressBoardOf()).success).toBe(true);
  });

  it('comes out the same at every call', () => {
    expect(stressBoardOf()).toEqual(stressBoardOf());
  });
});
