import { boardStateDto } from '@lorkarium/contracts';
import { blockersIgnoredAt, wallSegments } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { NO_BLOCKERS, NO_SIGHT_OUTLINES, sightGeometryOf } from '@/lib/sight-geometry';
import { gameWallOf } from '@/lib/wall-geometry';
import {
  STRESS_BLOCKER_OUTLINES,
  STRESS_PLAYER_IDS,
  stressBlockerBoardOf,
  stressBlockerIds,
  stressBoardOf,
  stressOverlappedBlockersBoardOf,
  stressToken,
} from './stress-board';

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

  it('gives one token in 10 an aura, a third of them an animated effect', () => {
    const auras = stressBoardOf().tokens.flatMap(({ aura }) => (aura ? [aura.kind] : []));
    expect(auras).toHaveLength(30);
    expect(auras.filter((kind) => kind === 'effect')).toHaveLength(10);
    expect(auras.filter((kind) => kind === 'color')).toHaveLength(20);
  });

  it('fits the scene: the contracts DTO accepts the snapshot', () => {
    expect(boardStateDto.safeParse(stressBoardOf()).success).toBe(true);
  });

  it('comes out the same at every call', () => {
    expect(stressBoardOf()).toEqual(stressBoardOf());
  });
});

describe('stressBlockerBoardOf', () => {
  it('has the 50 blockers of the ceiling, each with 48 vertices', () => {
    const { blockers } = sightGeometryOf(stressBlockerBoardOf(), STRESS_BLOCKER_OUTLINES);
    expect(blockers).toHaveLength(50);
    expect(new Set(blockers.map(({ tokenId }) => tokenId)).size).toBe(50);
    for (const { polygons } of blockers) {
      expect(polygons).toHaveLength(1);
      expect(polygons[0]).toHaveLength(48);
    }
  });

  it('puts 2400 more segments after the walls of the scene', () => {
    const { walls } = sightGeometryOf(stressBlockerBoardOf(), STRESS_BLOCKER_OUTLINES);
    const added = walls.slice(300).flatMap((wall) => wallSegments(wall));
    expect(added).toHaveLength(2400);
  });

  it('turns no eye and no torch into a blocker, and starts near the eye of the viewer', () => {
    const blockers = stressBlockerBoardOf().tokens.filter(({ blocksSight }) => blocksSight);
    expect(blockers.filter(({ sight, light }) => sight !== null || light !== null)).toEqual([]);
    expect(stressBlockerIds()[0]).toBe(stressToken(1).id);
  });

  it('leaves the historic scene with no blocker at all', () => {
    const board = stressBoardOf();
    expect(board.tokens.filter(({ blocksSight }) => blocksSight)).toEqual([]);
    expect(sightGeometryOf(board, NO_SIGHT_OUTLINES).blockers).toBe(NO_BLOCKERS);
  });

  it('changes nothing else of the historic scene', () => {
    const ids = new Set(stressBlockerIds());
    const others = stressBlockerBoardOf().tokens.filter(({ id }) => !ids.has(id));
    expect(others).toEqual(stressBoardOf().tokens.filter(({ id }) => !ids.has(id)));
  });

  it('fits the contracts DTO and comes out the same at every call', () => {
    expect(boardStateDto.safeParse(stressBlockerBoardOf()).success).toBe(true);
    expect(stressBlockerBoardOf()).toEqual(stressBlockerBoardOf());
  });
});

describe('stressOverlappedBlockersBoardOf', () => {
  it.each([
    [2.5, 2.5],
    [3.5, 2.5],
  ])('leaves the eye at (%f, %f) inside two blockers', (x, y) => {
    const board = stressOverlappedBlockersBoardOf();
    const { blockers } = sightGeometryOf(board, STRESS_BLOCKER_OUTLINES);
    const [first, second] = blockers;
    const ignored = blockersIgnoredAt({ x, y }, blockers);
    expect(ignored).toEqual([...(first?.walls ?? []), ...(second?.walls ?? [])]);
  });

  it('keeps the torch on that eye', () => {
    const eye = stressOverlappedBlockersBoardOf().tokens[0];
    expect(eye?.sight).not.toBeNull();
    expect(eye?.lightLit).toBe(true);
  });
});
