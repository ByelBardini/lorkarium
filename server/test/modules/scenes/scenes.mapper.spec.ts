import { describe, expect, it } from 'vitest';
import { toSceneDto, toSceneGrid, toSceneGridPo } from '../../../src/modules/scenes/scenes.mapper';
import { LYRA_PORTRAIT_ID } from '../../support/assets-factories';
import { scenePo, sceneRow } from '../../support/scenes-factories';

describe('scenes mapper', () => {
  it('a numeric cell distance "1.50" from Postgres becomes the number 1.5', () => {
    expect(toSceneDto(sceneRow({ cellDistance: '1.50' })).cellDistance).toBe(1.5);
  });

  it('the scene DTO carries the grid as saved, without version or dates', () => {
    expect(toSceneDto(sceneRow({ gridOpacity: 15, widthCells: 30 }))).toEqual({
      id: scenePo().id,
      name: 'Cena 1',
      widthCells: 30,
      heightCells: 12,
      cellDistance: 1.5,
      cellUnit: 'm',
      gridVisible: true,
      gridOpacity: 15,
      background: null,
    });
  });

  it('a scene with a background carries its asset and the pixels of the image', () => {
    const row = sceneRow({
      backgroundAssetId: LYRA_PORTRAIT_ID,
      backgroundWidth: 1400,
      backgroundHeight: 700,
    });

    expect(toSceneDto(row).background).toEqual({
      assetId: LYRA_PORTRAIT_ID,
      width: 1400,
      height: 700,
    });
  });

  it('a background id whose asset did not join (gone) is no background', () => {
    expect(toSceneDto(sceneRow({ backgroundAssetId: LYRA_PORTRAIT_ID })).background).toBeNull();
  });

  it('a grid of 2.5 ft cells becomes the PO with the distance as a numeric string', () => {
    const grid = {
      widthCells: 10,
      heightCells: 8,
      cellDistance: 2.5,
      cellUnit: 'ft',
      gridVisible: false,
      gridOpacity: 0,
    };
    expect(toSceneGridPo(grid)).toEqual({ ...grid, cellDistance: '2.5' });
  });

  it('a scene:configure command becomes the grid alone, without actionId or campaignId', () => {
    const grid = {
      widthCells: 30,
      heightCells: 20,
      cellDistance: 1.5,
      cellUnit: 'm',
      gridVisible: true,
      gridOpacity: 15,
    };
    const command = { actionId: 'action', campaignId: 'campaign', ...grid };
    expect(toSceneGrid(command)).toEqual(grid);
  });
});
