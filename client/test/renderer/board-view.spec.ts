import { cell } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { buildBoardView } from '@/renderer/board-view';
import { CELL_WORLD_SIZE } from '@/renderer/camera';
import { LYRA_ID, VHARN_SCENE, activeCondition, lyra } from '../support/table-session-fixtures';

const NO_TOKENS = {
  tokens: [],
  selectedTokenId: null,
  preview: null,
  readOnly: false,
  tool: 'select',
  currentTokenId: null,
} as const;

describe('buildBoardView', () => {
  it('carries the scene size in world px and the grid opacity as a fraction', () => {
    const view = buildBoardView({
      ...NO_TOKENS,
      scene: VHARN_SCENE,
      localGridVisible: true,
      ruler: null,
    });
    expect(view.sceneSize).toEqual({ width: 20 * CELL_WORLD_SIZE, height: 12 * CELL_WORLD_SIZE });
    expect(view.grid).toEqual({
      visible: true,
      opacity: 0.3,
      cells: { widthCells: 20, heightCells: 12 },
    });
    expect(view.ruler).toBeNull();
  });

  it.each([
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])('scene grid %s and local grid %s show the grid: %s', (scene, local, visible) => {
    const view = buildBoardView({
      ...NO_TOKENS,
      scene: { ...VHARN_SCENE, gridVisible: scene },
      localGridVisible: local,
      ruler: null,
    });
    expect(view.grid.visible).toBe(visible);
  });

  it('a ruler from (0,0) to (3,2) is 3 cells, with the label in the scene unit', () => {
    const view = buildBoardView({
      ...NO_TOKENS,
      scene: VHARN_SCENE,
      localGridVisible: true,
      ruler: { from: cell(0, 0), to: cell(3, 2) },
    });
    expect(view.ruler).toEqual({ from: cell(0, 0), to: cell(3, 2), label: '3 casas · 4,5 m' });
  });

  describe('tokens', () => {
    function viewOf(overrides: Partial<Parameters<typeof buildBoardView>[0]> = {}) {
      return buildBoardView({
        ...NO_TOKENS,
        scene: VHARN_SCENE,
        localGridVisible: true,
        ruler: null,
        tokens: [lyra()],
        ...overrides,
      });
    }

    it('a token is a disc with its initials, its side ring, its cell and its size', () => {
      expect(viewOf().tokens[0]).toMatchObject({
        id: LYRA_ID,
        initials: 'LY',
        ring: 'ally',
        col: 3,
        row: 4,
        size: 1,
        selected: false,
        draggable: true,
      });
    });

    it('the bar at position 0 is drawn under the token, filled by its value', () => {
      expect(viewOf().tokens[0]?.bar).toEqual({
        fraction: 32 / 45,
        state: 'normal',
        color: 'ember',
      });
    });

    it('without the bar at position 0 (hidden), the token has no bar even with position 1', () => {
      const redacted = lyra({ canControl: false, bars: lyra().bars.slice(1) });
      expect(viewOf({ tokens: [redacted] }).tokens[0]?.bar).toBeNull();
    });

    it('a negative first bar is drawn as negative', () => {
      const [pv, inspiration] = lyra().bars;
      if (!pv || !inspiration) throw new Error('lyra() lost its bars');
      const hurt = lyra({ bars: [{ ...pv, current: -4 }, inspiration] });
      expect(viewOf({ tokens: [hurt] }).tokens[0]?.bar?.state).toBe('negative');
    });

    it('the selected token is marked', () => {
      expect(viewOf({ selectedTokenId: LYRA_ID }).tokens[0]?.selected).toBe(true);
    });

    it('the preview shows a ghost at the cell asked for', () => {
      const view = viewOf({ preview: { tokenId: LYRA_ID, col: 8, row: 6 } });
      expect(view.ghost).toEqual({ tokenId: LYRA_ID, col: 8, row: 6, size: 1 });
    });

    it('a token the viewer cannot control, or any token while read only, is not draggable', () => {
      expect(viewOf({ tokens: [lyra({ canControl: false })] }).tokens[0]?.draggable).toBe(false);
      expect(viewOf({ readOnly: true }).tokens[0]?.draggable).toBe(false);
    });
  });

  describe('combat', () => {
    function viewWith(overrides: Partial<Parameters<typeof buildBoardView>[0]>) {
      return buildBoardView({
        ...NO_TOKENS,
        scene: VHARN_SCENE,
        localGridVisible: true,
        ruler: null,
        tokens: [lyra()],
        ...overrides,
      });
    }

    it('the token on turn gets the gold ring, and without combat nobody does', () => {
      expect(viewWith({ currentTokenId: LYRA_ID }).tokens[0]?.onTurn).toBe(true);
      expect(viewWith({}).tokens[0]?.onTurn).toBe(false);
    });

    it('up to 3 condition marks, colored by tone, and a "+" past that', () => {
      const tones = ['harm', 'benefit', 'harm', 'harm', 'benefit'] as const;
      const conditions = tones.map((tone, index) => activeCondition({ id: `c-${index}`, tone }));
      const token = viewWith({ tokens: [lyra({ conditions })] }).tokens[0];
      expect(token?.marks).toEqual(['harm', 'benefit', 'harm']);
      expect(token?.moreMarks).toBe(true);
    });

    it('a token with two conditions has two marks and no "+"', () => {
      const conditions = [
        activeCondition({ id: 'a' }),
        activeCondition({ id: 'b', tone: 'benefit' }),
      ];
      const token = viewWith({ tokens: [lyra({ conditions })] }).tokens[0];
      expect(token?.marks).toEqual(['harm', 'benefit']);
      expect(token?.moreMarks).toBe(false);
    });
  });
});
