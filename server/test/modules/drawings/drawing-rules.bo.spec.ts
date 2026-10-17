import { drawingBox } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { DrawingRulesBo } from '../../../src/modules/drawings/drawing-rules.bo';
import { SQUARE_ID } from '../../support/drawings-factories';

const rules = new DrawingRulesBo({ scene: { widthCells: 20, heightCells: 12 }, limit: 500 });

describe('DrawingRulesBo.place', () => {
  it('a box inside the scene is kept as it is', () => {
    expect(rules.place(drawingBox(17, 10, 3, 2))).toEqual({ x: 17, y: 10, width: 3, height: 2 });
  });

  it('a freehand line of width 0 on the last column fits', () => {
    expect(() => rules.place(drawingBox(20, 2, 0, 3))).not.toThrow();
  });

  it('a box past the right edge is refused with OUT_OF_SCENE citing the box and the scene', () => {
    expect(() => rules.place(drawingBox(19, 2, 2, 1))).toThrow(
      expect.objectContaining({
        code: 'OUT_OF_SCENE',
        message: expect.stringMatching(/\(19, 2\) of 2×1 .*20×12 scene/),
      }),
    );
  });
});

describe('DrawingRulesBo.admit', () => {
  it('the 500th drawing of a scene is admitted', () => {
    expect(() => rules.admit(499, 1)).not.toThrow();
  });

  it('the 501st drawing is refused with DRAWING_LIMIT citing the count and the limit', () => {
    expect(() => rules.admit(500, 1)).toThrow(
      expect.objectContaining({
        code: 'DRAWING_LIMIT',
        message: expect.stringMatching(/has 500 drawings; adding 1 .*limit of 500/),
      }),
    );
  });

  it('a paste that would cross the limit is refused whole', () => {
    expect(() => rules.admit(498, 3)).toThrow(expect.objectContaining({ code: 'DRAWING_LIMIT' }));
  });
});

describe('DrawingRulesBo.requireAt', () => {
  it('no precondition (a normal command) never refuses', () => {
    expect(() => rules.requireAt(SQUARE_ID, undefined, { x: 9, y: 9 })).not.toThrow();
  });

  it('an expected position equal to the saved one to the hundredth passes', () => {
    expect(() => rules.requireAt(SQUARE_ID, { x: 2.5, y: 3 }, { x: 2.5, y: 3.004 })).not.toThrow();
  });

  it('a drawing moved by someone else since is refused with STALE_UNDO citing the drawing, expected and current', () => {
    expect(() => rules.requireAt(SQUARE_ID, { x: 2.5, y: 3 }, { x: 6, y: 1 })).toThrow(
      expect.objectContaining({
        code: 'STALE_UNDO',
        message: expect.stringMatching(
          new RegExp(`drawing ${SQUARE_ID} is at \\(6, 1\\); the undo expected \\(2.5, 3\\)`),
        ),
      }),
    );
  });
});
