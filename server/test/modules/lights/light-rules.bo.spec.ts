import { lightRange, sceneLight } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import { LightRulesBo } from '../../../src/modules/lights/light-rules.bo';

const SCENE_20_BY_12 = { widthCells: 20, heightCells: 12 };
const TORCH_ID = 'torch-1';

function rules(): LightRulesBo {
  return new LightRulesBo({ scene: SCENE_20_BY_12, limit: 100 });
}

function torchAt(x: number, y: number) {
  return sceneLight({ x, y, range: lightRange(4, 4), lit: true, facing: 0, angle: 360 });
}

describe('LightRulesBo', () => {
  describe('place', () => {
    it('a light on the far corner (20, 12) of a 20 × 12 scene fits', () => {
      expect(rules().place(torchAt(20, 12))).toEqual(torchAt(20, 12));
    });

    it('a light at (20.5, 3) is OUT_OF_SCENE citing the point and the scene', () => {
      expect(() => rules().place(torchAt(20.5, 3))).toThrow(
        expect.objectContaining({
          code: 'OUT_OF_SCENE',
          message: 'a light at (20.5, 3) does not fit the 20×12 scene',
        }),
      );
    });
  });

  describe('admit', () => {
    it('99 stored plus 1 new is 100 lights and passes', () => {
      expect(() => rules().admit(99, 1)).not.toThrow();
    });

    it('100 stored plus 1 new is LIGHT_LIMIT citing the total and the limit', () => {
      expect(() => rules().admit(100, 1)).toThrow(
        expect.objectContaining({
          code: 'LIGHT_LIMIT',
          message: 'the scene would have 101 lights; expected at most 100',
        }),
      );
    });
  });

  describe('requireAt', () => {
    it('a precondition other than where the light is is STALE_UNDO citing both points', () => {
      expect(() => rules().requireAt(TORCH_ID, { x: 2, y: 2 }, { x: 5, y: 5 })).toThrow(
        expect.objectContaining({
          code: 'STALE_UNDO',
          message: 'light torch-1 is at (5, 5); the undo expected (2, 2)',
        }),
      );
    });

    it.each([
      ['no precondition', undefined],
      ['the same point to the hundredth', { x: 5.001, y: 5 }],
    ])('%s passes', (_name, expected) => {
      expect(() => rules().requireAt(TORCH_ID, expected, { x: 5, y: 5 })).not.toThrow();
    });
  });

  describe('requireRange', () => {
    it('a precondition other than the range of the light is STALE_UNDO citing both ranges', () => {
      const actual = lightRange(4, 4);
      expect(() => rules().requireRange(TORCH_ID, { bright: 6, dim: 6 }, actual)).toThrow(
        expect.objectContaining({
          code: 'STALE_UNDO',
          message: 'light torch-1 is at bright 4, dim 4; the undo expected bright 6, dim 6',
        }),
      );
    });

    it('no precondition passes', () => {
      expect(() => rules().requireRange(TORCH_ID, undefined, lightRange(4, 4))).not.toThrow();
    });
  });

  describe('requireColor', () => {
    it.each([
      ['no precondition', undefined, 'fire'],
      ['the same color', { color: 'fire' }, 'fire'],
      ['neutral expected on a neutral light', { color: null }, null],
    ] as const)('%s passes', (_name, expected, actual) => {
      expect(rules().requireColor(TORCH_ID, expected, actual)).toBeUndefined();
    });

    it('a torch precondition on a fire light is STALE_UNDO citing both colors', () => {
      expect(() => rules().requireColor(TORCH_ID, { color: 'torch' }, 'fire')).toThrow(
        expect.objectContaining({
          code: 'STALE_UNDO',
          message: 'light torch-1 is at fire; the undo expected torch',
        }),
      );
    });

    it('a neutral precondition on a moon light is STALE_UNDO naming it neutral', () => {
      expect(() => rules().requireColor(TORCH_ID, { color: null }, 'moon')).toThrow(
        expect.objectContaining({ message: 'light torch-1 is at moon; the undo expected neutral' }),
      );
    });
  });

  describe('requireCone', () => {
    const SPOT = { facing: 90, angle: 60 };

    it('a command without expect always passes', () => {
      expect(() => rules().requireCone(TORCH_ID, undefined, SPOT)).not.toThrow();
    });

    it('an expect equal to the current cone passes', () => {
      expect(() => rules().requireCone(TORCH_ID, { facing: 90, angle: 60 }, SPOT)).not.toThrow();
    });

    it('an expect of another cone is STALE_UNDO citing both cones', () => {
      const undo = () => rules().requireCone(TORCH_ID, { facing: 0, angle: 360 }, SPOT);
      expect(undo).toThrow(expect.objectContaining({ code: 'STALE_UNDO' }));
      expect(undo).toThrow(
        /facing 90, angle 60.*facing 0, angle 360|facing 0, angle 360.*facing 90, angle 60/,
      );
    });
  });
});
