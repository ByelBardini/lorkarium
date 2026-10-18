import { describe, expect, it } from 'vitest';
import {
  toEffectAreaDto,
  toEffectAreaReshapePo,
  toNewEffectAreaPo,
} from '../../../src/modules/effect-areas/effect-areas.mapper';
import { BIA_ID } from '../../support/campaigns-factories';
import { BIA_CONE_ID, biaConePo } from '../../support/effect-areas-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';

describe('toEffectAreaDto', () => {
  it('a cone row with "5.00" and "5.50" becomes numbers, with only the fields of a cone', () => {
    expect(toEffectAreaDto(biaConePo())).toEqual({
      id: BIA_CONE_ID,
      authorId: BIA_ID,
      kind: 'orthogonal_cone',
      x: 5,
      y: 5.5,
      reach: 3,
      facing: 0,
      color: 'ember',
    });
  });

  it('a square row carries its sides and no reach nor facing', () => {
    const square = biaConePo({
      kind: 'square',
      x: '2.00',
      y: '3.00',
      width: '3.00',
      height: '2.00',
    });
    expect(toEffectAreaDto(square)).toEqual({
      id: BIA_CONE_ID,
      authorId: BIA_ID,
      kind: 'square',
      x: 2,
      y: 3,
      width: 3,
      height: 2,
      color: 'ember',
    });
  });

  it('a broken row (a grid circle at x "2.50") throws citing the area and the origin', () => {
    const broken = biaConePo({ kind: 'circle', x: '2.50', y: '3.00' });
    expect(() => toEffectAreaDto(broken)).toThrow(
      new RegExp(`effect area ${BIA_CONE_ID} was saved broken.*origin \\(2\\.5, 3\\)`),
    );
  });
});

describe('toNewEffectAreaPo', () => {
  it('a smooth circle zeroes the fields it does not use and rounds to the hundredth', () => {
    const shape = {
      kind: 'smooth_circle',
      x: 5.234,
      y: 4.875,
      reach: 2.271,
      color: 'gold',
    } as const;
    expect(toNewEffectAreaPo(VHARN_SCENE_ID, BIA_ID, shape)).toEqual({
      sceneId: VHARN_SCENE_ID,
      authorId: BIA_ID,
      kind: 'smooth_circle',
      x: '5.23',
      y: '4.88',
      width: '0.00',
      height: '0.00',
      reach: '2.27',
      facing: 0,
      color: 'gold',
    });
  });

  it('an emanation keeps its footprint and reach', () => {
    const aura = {
      kind: 'emanation',
      x: 5.5,
      y: 4,
      width: 1,
      height: 2,
      reach: 2,
      color: 'violet',
    } as const;
    expect(toNewEffectAreaPo(VHARN_SCENE_ID, BIA_ID, aura)).toMatchObject({
      x: '5.50',
      width: '1.00',
      height: '2.00',
      reach: '2.00',
      facing: 0,
    });
  });
});

describe('toEffectAreaReshapePo', () => {
  it('a line turned to 30 degrees keeps the facing and zeroes the sides', () => {
    const line = { kind: 'line', x: 2.5, y: 2.5, reach: 3, facing: 30, color: 'ash' } as const;
    expect(toEffectAreaReshapePo({ effectAreaId: BIA_CONE_ID, shape: line })).toEqual({
      effectAreaId: BIA_CONE_ID,
      shape: {
        kind: 'line',
        x: '2.50',
        y: '2.50',
        width: '0.00',
        height: '0.00',
        reach: '3.00',
        facing: 30,
        color: 'ash',
      },
    });
  });
});
