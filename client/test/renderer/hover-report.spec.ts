import { cell } from '@lorkarium/game-core';
import { beforeEach, describe, expect, it } from 'vitest';
import type { BoardIntent } from '@/renderer/board-renderer';
import { HoverReport, tokenScreenRect } from '@/renderer/hover-report';

describe('HoverReport', () => {
  let heard: BoardIntent[];
  let hover: HoverReport;

  beforeEach(() => {
    heard = [];
    hover = new HoverReport((intent) => heard.push(intent));
  });

  it('a new cell under the pointer is reported once, however many moves inside it', () => {
    hover.moved({ cell: cell(2, 3), pressed: false, token: null });
    hover.moved({ cell: cell(2, 3), pressed: false, token: null });
    hover.moved({ cell: cell(3, 3), pressed: false, token: null });
    expect(heard).toEqual([
      { kind: 'pointerHovered', cell: cell(2, 3) },
      { kind: 'pointerHovered', cell: cell(3, 3) },
    ]);
  });

  it('a move with a button held is no hover', () => {
    hover.moved({ cell: cell(2, 3), pressed: true, token: null });
    expect(heard).toEqual([]);
  });

  it('leaving the board reports no cell, once', () => {
    hover.moved({ cell: cell(2, 3), pressed: false, token: null });
    hover.left();
    hover.left();
    expect(heard.at(-1)).toEqual({ kind: 'pointerHovered', cell: null });
    expect(heard).toHaveLength(2);
  });

  it('off the scene is reported as no cell', () => {
    hover.moved({ cell: null, pressed: false, token: null });
    expect(heard).toEqual([{ kind: 'pointerHovered', cell: null }]);
  });

  describe('the token under the pointer', () => {
    const KAEL = { tokenId: 'kael', rect: { x: 100, y: 80, width: 64, height: 64 } };
    const LYRA = { tokenId: 'lyra', rect: { x: 164, y: 80, width: 64, height: 64 } };

    function tokenIntents(): BoardIntent[] {
      return heard.filter(({ kind }) => kind === 'tokenHovered');
    }

    function hoveredTokens(): unknown[] {
      return tokenIntents().map((intent) =>
        intent.kind === 'tokenHovered' ? { tokenId: intent.tokenId, rect: intent.rect } : null,
      );
    }

    it('is reported only when it changes, with its rectangle on the screen', () => {
      hover.moved({ cell: cell(1, 1), pressed: false, token: KAEL });
      hover.moved({ cell: cell(1, 1), pressed: false, token: KAEL });
      hover.moved({ cell: cell(2, 1), pressed: false, token: LYRA });
      expect(tokenIntents()).toEqual([
        { kind: 'tokenHovered', ...KAEL },
        { kind: 'tokenHovered', ...LYRA },
      ]);
    });

    it('is never reported with a button held', () => {
      hover.moved({ cell: cell(1, 1), pressed: true, token: KAEL });
      expect(tokenIntents()).toEqual([]);
    });

    it('moving off it, or off the board, reports no token', () => {
      hover.moved({ cell: cell(1, 1), pressed: false, token: KAEL });
      hover.moved({ cell: cell(5, 5), pressed: false, token: null });
      hover.moved({ cell: cell(1, 1), pressed: false, token: KAEL });
      hover.left();
      expect(hoveredTokens()).toEqual([
        KAEL,
        { tokenId: null, rect: null },
        KAEL,
        { tokenId: null, rect: null },
      ]);
    });

    it('a camera that moves reports no token (its rectangle went stale), and the same token is news again', () => {
      hover.camera({ offsetX: 0, offsetY: 0, zoom: 1 });
      hover.moved({ cell: cell(1, 1), pressed: false, token: KAEL });
      hover.camera({ offsetX: 0, offsetY: 0, zoom: 1 });
      hover.camera({ offsetX: 10, offsetY: 0, zoom: 1 });
      hover.moved({ cell: cell(1, 1), pressed: false, token: KAEL });
      expect(hoveredTokens()).toEqual([KAEL, { tokenId: null, rect: null }, KAEL]);
    });

    it('a camera that moves with no token hovered says nothing', () => {
      hover.camera({ offsetX: 10, offsetY: 0, zoom: 2 });
      expect(heard).toEqual([]);
    });
  });
});

describe('tokenScreenRect', () => {
  it('a 1×1 token at (2, 1) seen at zoom 2 with the canvas 40 px from the left is in viewport px', () => {
    const camera = { offsetX: 10, offsetY: 20, zoom: 2 };
    const token = { col: 2, row: 1, width: 1, height: 1 };
    expect(tokenScreenRect(token, camera, { left: 40, top: 48 })).toEqual({
      x: 40 + 10 + 128 * 2,
      y: 48 + 20 + 64 * 2,
      width: 128,
      height: 128,
    });
  });
});
