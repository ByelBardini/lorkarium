import { describe, expect, it } from 'vitest';
import { boardCursorOf, PEN_CURSOR, RULER_CURSOR } from '@/renderer/board-cursor';

describe('boardCursorOf', () => {
  it('shows the move cursor while the right button pans, whatever the tool', () => {
    expect(boardCursorOf({ tool: 'draw', drawKind: 'freehand', panning: true })).toBe('move');
    expect(boardCursorOf({ tool: 'ruler', drawKind: null, panning: true })).toBe('move');
  });

  it('shows the ruler cursor with the ruler tool', () => {
    expect(boardCursorOf({ tool: 'ruler', drawKind: null, panning: false })).toBe(RULER_CURSOR);
  });

  it('shows a pen for freehand and a crosshair for the shapes', () => {
    expect(boardCursorOf({ tool: 'draw', drawKind: 'freehand', panning: false })).toBe(PEN_CURSOR);
    expect(boardCursorOf({ tool: 'draw', drawKind: 'rectangle', panning: false })).toBe(
      'crosshair',
    );
  });

  it('shows a crosshair with the area of effect tool', () => {
    expect(boardCursorOf({ tool: 'area', drawKind: null, panning: false })).toBe('crosshair');
  });

  it('with the walls tool: a crosshair to draw and to drag the eraser box, a hand over what a click erases', () => {
    const walls = (wallMode: 'draw' | 'eraseArea' | 'eraseWall' | 'eraseSegment') =>
      boardCursorOf({ tool: 'walls', drawKind: null, panning: false, wallMode });

    expect(walls('draw')).toBe('crosshair');
    expect(walls('eraseArea')).toBe('crosshair');
    expect(walls('eraseWall')).toBe('pointer');
    expect(walls('eraseSegment')).toBe('pointer');
  });

  it('keeps the default arrow with the select tool', () => {
    expect(boardCursorOf({ tool: 'select', drawKind: null, panning: false })).toBe('default');
  });

  it('builds the svg cursors with a keyword fallback', () => {
    expect(PEN_CURSOR).toMatch(/^url\("data:image\/svg\+xml,.+"\) \d+ \d+, crosshair$/);
  });
});
