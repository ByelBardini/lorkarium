import { describe, expect, it } from 'vitest';
import {
  AREA_HINT,
  CONDITION_HINT,
  DRAW_HINT,
  DRAW_MODE_HINT,
  drawModeChangeOf,
  hintOf,
  toolChangeOf,
} from '@/stores/board-tool-state';

const MASTER = { canChooseLayer: true, wallMode: 'draw', drawMode: 'draw' } as const;
const PLAYER = { canChooseLayer: false, wallMode: 'draw', drawMode: 'draw' } as const;

describe('hintOf', () => {
  it('the walls tool says the hint of its mode', () => {
    expect(hintOf('walls', { wallMode: 'eraseWall', drawMode: 'draw' })).toBe(
      'Clique numa parede para apagá-la inteira.',
    );
  });

  it('the draw tool says the hint of its mode', () => {
    expect(hintOf('draw', { wallMode: 'draw', drawMode: 'draw' })).toBe(DRAW_HINT);
    expect(hintOf('draw', { wallMode: 'draw', drawMode: 'select' })).toBe(DRAW_MODE_HINT.select);
  });

  it('the select tool says nothing', () => {
    expect(hintOf('select', { wallMode: 'draw', drawMode: 'select' })).toBeNull();
  });
});

describe('toolChangeOf', () => {
  it('a player cannot take the walls tool', () => {
    expect(toolChangeOf(PLAYER, 'walls')).toBeNull();
  });

  it('the draw tool drops the selection, the ruler and the walls and lights picked, and gives its hint', () => {
    expect(toolChangeOf(PLAYER, 'draw')).toEqual({
      tool: 'draw',
      drawMode: 'draw',
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

  it('the draw tool starts again in Desenhar, even when it was left in Selecionar', () => {
    const leftSelecting = { ...PLAYER, drawMode: 'select' } as const;

    expect(toolChangeOf(leftSelecting, 'draw')).toMatchObject({
      drawMode: 'draw',
      notice: DRAW_HINT,
    });
  });

  it('another tool leaves the draw mode alone', () => {
    expect(toolChangeOf(MASTER, 'select')).not.toHaveProperty('drawMode');
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

  it('a player takes the condition tool, which goes to the Tokens layer with its hint', () => {
    expect(toolChangeOf(PLAYER, 'conditions')).toMatchObject({
      tool: 'conditions',
      activeLayer: 'tokens',
      notice: CONDITION_HINT,
    });
  });

  it('the condition tool keeps the selection (it stamps tokens, it sketches nothing)', () => {
    expect(toolChangeOf(MASTER, 'conditions')).not.toHaveProperty('selectedTokenIds');
  });

  it('the condition tool hint asks for a condition from the panel', () => {
    expect(hintOf('conditions', { wallMode: 'draw', drawMode: 'draw' })).toBe(
      'Escolha uma condição no painel.',
    );
  });

  it('the ruler keeps the selection', () => {
    expect(toolChangeOf(MASTER, 'ruler')).not.toHaveProperty('selectedTokenIds');
  });
});

describe('drawModeChangeOf', () => {
  it('Selecionar gives its hint and drops the selection', () => {
    expect(drawModeChangeOf('select')).toEqual({
      drawMode: 'select',
      notice: DRAW_MODE_HINT.select,
      selectedTokenIds: [],
      selectedDrawingIds: [],
      selectedEffectAreaIds: [],
      selectedWallIds: [],
      selectedLightIds: [],
    });
  });

  it('back to Desenhar the drawings picked go', () => {
    expect(drawModeChangeOf('draw')).toMatchObject({
      drawMode: 'draw',
      notice: DRAW_HINT,
      selectedDrawingIds: [],
    });
  });
});
