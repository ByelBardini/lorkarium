import { describe, expect, it } from 'vitest';
import {
  coneOfLight,
  lightSourceOfRow,
  savedConeOf,
  sceneLightOf,
  toLightConePo,
  toLightDto,
  toNewLightPo,
} from '../../../src/modules/lights/lights.mapper';
import { CORRIDOR_TORCH_ID, corridorTorchPo, newTorch } from '../../support/lights-factories';
import { VHARN_SCENE_ID } from '../../support/scenes-factories';

describe('lights mapper', () => {
  it('a saved torch becomes the DTO in numbers', () => {
    expect(toLightDto(corridorTorchPo({ x: '5.50', lit: false }))).toEqual({
      id: CORRIDOR_TORCH_ID,
      x: 5.5,
      y: 5,
      bright: 4,
      dim: 4,
      lit: false,
      color: null,
      facing: 0,
      angle: 360,
    });
  });

  it('a saved moon torch carries its color to the DTO', () => {
    expect(toLightDto(corridorTorchPo({ color: 'moon' })).color).toBe('moon');
  });

  it('a row the game-core refuses is a broken table, cited with its id and the cause', () => {
    const broken = corridorTorchPo({ bright: '101.00' });
    expect(() => sceneLightOf(broken)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(`light ${CORRIDOR_TORCH_ID} was saved broken`),
        cause: expect.any(RangeError),
      }),
    );
  });

  it('a placement becomes the row to insert, to the hundredth and lit', () => {
    expect(toNewLightPo(VHARN_SCENE_ID, newTorch({ x: 10 / 3, dim: 2.006 }))).toEqual({
      sceneId: VHARN_SCENE_ID,
      x: '3.33',
      y: '3.00',
      bright: '4.00',
      dim: '2.01',
      lit: true,
      color: null,
      facing: 0,
      angle: 360,
    });
  });

  it('a torch placement keeps its color in the row to insert', () => {
    expect(toNewLightPo(VHARN_SCENE_ID, newTorch({ color: 'torch' }))).toMatchObject({
      color: 'torch',
      lit: true,
    });
  });

  it('a lit torch shines from its point', () => {
    expect(lightSourceOfRow(corridorTorchPo())).toEqual({
      center: { x: 5, y: 5 },
      range: { bright: 4, dim: 4 },
      cone: null,
    });
  });

  it('a torch that is out gives no light source', () => {
    expect(lightSourceOfRow(corridorTorchPo({ lit: false }))).toBeNull();
  });

  it('a saved spotlight facing 90 and opening 60 carries both to the DTO', () => {
    expect(toLightDto(corridorTorchPo({ facing: 90, angle: 60 }))).toMatchObject({
      facing: 90,
      angle: 60,
    });
  });

  it('a spotlight placement keeps its facing and angle in the row to insert', () => {
    expect(toNewLightPo(VHARN_SCENE_ID, newTorch({ facing: 90, angle: 60 }))).toMatchObject({
      facing: 90,
      angle: 60,
    });
  });

  it('a lit spotlight of 60° shines in its cone, and a light of 360° every side', () => {
    expect(lightSourceOfRow(corridorTorchPo({ facing: 90, angle: 60 }))?.cone).toEqual({
      facing: 90,
      angle: 60,
    });
    expect(lightSourceOfRow(corridorTorchPo({ facing: 90 }))?.cone).toBeNull();
  });

  it('a row saved with an angle of 0 is a broken table, cited with its id', () => {
    expect(() => sceneLightOf(corridorTorchPo({ angle: 0 }))).toThrow(
      `light ${CORRIDOR_TORCH_ID} was saved broken`,
    );
  });

  it('a cone change becomes the columns to save and the change to publish, without expect', () => {
    const change = {
      lightId: CORRIDOR_TORCH_ID,
      facing: 90,
      angle: 60,
      expect: { facing: 0, angle: 360 },
    };
    const cone = { lightId: CORRIDOR_TORCH_ID, facing: 90, angle: 60 };

    expect(toLightConePo(change)).toEqual(cone);
    expect(savedConeOf(change)).toEqual(cone);
  });

  it('the cone of a saved light, as the rule compares it', () => {
    expect(coneOfLight(corridorTorchPo({ facing: 45, angle: 90 }))).toEqual({
      facing: 45,
      angle: 90,
    });
  });
});
