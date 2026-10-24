import { describe, expect, it } from 'vitest';
import { boardWithCast, resolveLinkedTokens } from '@/lib/linked-tokens';
import { castBoard, linkedLyra, lyraAnchor } from '../support/cast-fixtures';
import {
  BIA_AT_TABLE,
  activeCondition,
  kael,
  memberCard,
  vharnBoard,
} from '../support/table-session-fixtures';

const IMAGE_ID = '7f6e5d4c-3b2a-4f1e-8d9c-0b1a2c3d4e5f';
const TORCH = { bright: 4, dim: 4, color: 'torch' as const, angle: 360 };

describe('resolveLinkedTokens', () => {
  const anchor = lyraAnchor({
    name: 'Lyra Vandel',
    initials: 'LV',
    side: 'neutral',
    imageAssetId: IMAGE_ID,
    frame: 'round',
    defeated: true,
    conditions: [activeCondition()],
    controllerIds: [BIA_AT_TABLE.userId, 'c0ffee00-0000-4000-8000-000000000001'],
    canControl: false,
    // What is the token's own in each grid: the anchor's copy must not leak in.
    col: 0,
    row: 0,
    width: 2,
    height: 2,
    layer: 'objects',
    facing: 90,
    flipX: true,
    sight: { bright: 6, dim: 0 },
  });

  it('a linked token shows the identity, bars, conditions and control of its anchor', () => {
    const [token] = resolveLinkedTokens([linkedLyra()], [anchor]);
    expect(token).toMatchObject({
      name: 'Lyra Vandel',
      initials: 'LV',
      side: 'neutral',
      imageAssetId: IMAGE_ID,
      frame: 'round',
      defeated: true,
      bars: anchor.bars,
      conditions: anchor.conditions,
      controllerIds: anchor.controllerIds,
      canControl: false,
    });
  });

  it('keeps its own place, size, layer, facing, flips, sight and light', () => {
    const own = linkedLyra({ col: 7, row: 2, light: TORCH, lightLit: false });
    const [token] = resolveLinkedTokens([own], [anchor]);
    expect(token).toMatchObject({
      id: own.id,
      col: 7,
      row: 2,
      width: 1,
      height: 1,
      layer: 'tokens',
      facing: 0,
      flipX: false,
      sight: null,
      light: TORCH,
      lightLit: false,
      anchorTokenId: anchor.id,
    });
  });

  it('a loose token passes as it came', () => {
    const loose = kael();
    expect(resolveLinkedTokens([loose], [anchor])[0]).toBe(loose);
  });

  it('with the anchor unknown (the cast still loading) the token is the one of the snapshot', () => {
    const tokens = [linkedLyra()];
    expect(resolveLinkedTokens(tokens, [])).toBe(tokens);
  });

  it('the same input gives back the same array, and nothing to change gives the input', () => {
    const tokens = [linkedLyra(), kael()];
    const anchors = [anchor];
    const first = resolveLinkedTokens(tokens, anchors);
    expect(resolveLinkedTokens(tokens, anchors)).toBe(first);
    expect(first).not.toBe(tokens);
    expect(resolveLinkedTokens(first, anchors)).toBe(first);
    expect(first[1]).toBe(tokens[1]);
  });
});

describe('boardWithCast', () => {
  it('takes the cards and the defined conditions from the cast, and resolves the linked tokens', () => {
    const cards = [memberCard({ armorClass: 17, anchorTokenId: lyraAnchor().id })];
    const cast = castBoard({ memberCards: cards });
    const grid = vharnBoard({ tokens: [linkedLyra()], memberCards: [memberCard()] });
    const board = boardWithCast(grid, cast);
    expect(board.memberCards).toBe(cards);
    expect(board.conditionDefinitions).toBe(cast.conditionDefinitions);
    expect(board.tokens[0]?.bars[0]?.current).toBe(25);
    expect(board.version).toBe(grid.version);
    expect(boardWithCast(grid, cast)).toBe(board);
  });

  it('without the cast the board is the grid snapshot', () => {
    const grid = vharnBoard({ tokens: [linkedLyra()] });
    expect(boardWithCast(grid, null)).toBe(grid);
  });
});
