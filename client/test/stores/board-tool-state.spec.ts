import { describe, expect, it } from 'vitest';
import { AREA_HINT, DRAW_HINT, hintOf, toolChangeOf } from '@/stores/board-tool-state';

const MASTER = { canChooseLayer: true, wallMode: 'draw' } as const;
const PLAYER = { canChooseLayer: false, wallMode: 'draw' } as const;

describe('hintOf', () => {
  it('the walls tool says the hint of its mode', () => {
    expect(hintOf('walls', 'eraseWall')).toBe('Clique numa parede para apagá-la inteira.');
  });

  it('the select tool says nothing', () => {
    expect(hintOf('select', 'draw')).toBeNull();
  });
});

describe('toolChangeOf', () => {
  it('a player cannot take the walls tool', () => {
    expect(toolChangeOf(PLAYER, 'walls')).toBeNull();
  });

  it('the draw tool drops the selection, the ruler and the walls and lights picked, and gives its hint', () => {
    expect(toolChangeOf(PLAYER, 'draw')).toEqual({
      tool: 'draw',
      ruler: null,
      measuring: false,
      notice: DRAW_HINT,
      selectedTokenIds: [],
      selectedDrawingIds: [],
      selectedEffectAreaIds: [],
      selectedWallIds: [],
      selectedLightIds: [],
      lightAimPreview: {},
    });
  });

  it('the area tool goes to the Tokens layer', () => {
    expect(toolChangeOf(MASTER, 'area')).toMatchObject({
      activeLayer: 'tokens',
      notice: AREA_HINT,
    });
  });

  it('a player cannot take the lights tool', () => {
    expect(toolChangeOf(PLAYER, 'lights')).toBeNull();
  });

  it('the ruler keeps the selection', () => {
    expect(toolChangeOf(MASTER, 'ruler')).not.toHaveProperty('selectedTokenIds');
  });
});
