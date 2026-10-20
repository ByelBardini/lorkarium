import { describe, expect, it } from 'vitest';
import { parseBoardEvent } from '@/services/board-events';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { shapeOfEffectArea } from '@/lib/effect-area-shape';
import { BIA_CONE_ID, biaCone } from '../support/effect-area-fixtures';
import { sceneUpdated } from '../support/table-session-fixtures';
import { CELL_DOOR_ID, NORTH_WALL_ID, cellDoor, northWall } from '../support/wall-fixtures';
import { CORRIDOR_TORCH_ID, corridorTorch } from '../support/light-fixtures';

describe('parseBoardEvent', () => {
  it('a valid scene:updated of the table is a sceneUpdated event', () => {
    expect(parseBoardEvent('scene:updated', sceneUpdated(), VHARN.id)).toEqual({
      kind: 'event',
      event: { type: 'sceneUpdated', payload: sceneUpdated() },
    });
  });

  it('an event of another table is not ours, even when malformed', () => {
    const malformed = { campaignId: QUELM.id, version: 'x' };
    expect(parseBoardEvent('scene:updated', malformed, VHARN.id)).toEqual({ kind: 'other-table' });
  });

  it('an event of the table outside the DTO is invalid', () => {
    const malformed = { ...sceneUpdated(), version: -1 };
    expect(parseBoardEvent('scene:updated', malformed, VHARN.id)).toEqual({ kind: 'invalid' });
  });

  it('a payload without a campaign id is not ours', () => {
    expect(parseBoardEvent('scene:updated', 'boom', VHARN.id)).toEqual({ kind: 'other-table' });
  });

  it('an unknown event name throws citing it and the known names', () => {
    expect(() => parseBoardEvent('token:teleported', {}, VHARN.id)).toThrow(
      /token:teleported.*scene:updated/,
    );
  });

  it.each([
    [
      'token:movedMany',
      'tokensMoved',
      { moves: [{ tokenId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a', col: 8, row: 6 }] },
    ],
    [
      'token:layerChanged',
      'tokenLayerChanged',
      { tokenIds: ['5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a'], layer: 'objects' },
    ],
    [
      'token:facedMany',
      'tokensFaced',
      { faces: [{ tokenId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a', facing: 45 }] },
    ],
    [
      'token:resizedMany',
      'tokensResized',
      {
        resizes: [
          {
            tokenId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a',
            col: 1.5,
            row: 0,
            width: 2,
            height: 1,
          },
        ],
      },
    ],
    [
      'token:restyledMany',
      'tokensRestyled',
      { tokenIds: ['5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a'], style: { frame: 'round' } },
    ],
  ])('a valid %s of the table is a %s event', (name, type, fields) => {
    const payload = { campaignId: VHARN.id, version: 6, at: '2026-10-16T12:00:00.000Z', ...fields };
    expect(parseBoardEvent(name, payload, VHARN.id)).toEqual({
      kind: 'event',
      event: { type, payload },
    });
  });

  it('a token:facedMany of the table with facing 360 is invalid (resync)', () => {
    const payload = {
      campaignId: VHARN.id,
      version: 6,
      at: '2026-10-16T12:00:00.000Z',
      faces: [{ tokenId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a', facing: 360 }],
    };
    expect(parseBoardEvent('token:facedMany', payload, VHARN.id)).toEqual({ kind: 'invalid' });
  });

  it('a token:resizedMany with a quarter cell is invalid (resync)', () => {
    const payload = {
      campaignId: VHARN.id,
      version: 6,
      at: '2026-10-16T12:00:00.000Z',
      resizes: [
        { tokenId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a', col: 0, row: 0, width: 1.25, height: 1 },
      ],
    };
    expect(parseBoardEvent('token:resizedMany', payload, VHARN.id)).toEqual({ kind: 'invalid' });
  });

  it('a token:layerChanged of the table on an unknown layer is invalid', () => {
    const payload = { campaignId: VHARN.id, version: 6, at: '2026-10-16T12:00:00.000Z' };
    const parsed = parseBoardEvent(
      'token:layerChanged',
      { ...payload, tokenIds: [], layer: 'gm' },
      VHARN.id,
    );
    expect(parsed).toEqual({ kind: 'invalid' });
  });

  describe('effect areas', () => {
    const base = { campaignId: VHARN.id, version: 6, at: '2026-10-18T12:00:00.000Z' };
    const coneShape = shapeOfEffectArea(biaCone());

    it.each([
      ['effectArea:createdMany', 'effectAreasCreated', { effectAreas: [biaCone()] }],
      [
        'effectArea:reshapedMany',
        'effectAreasReshaped',
        { reshapes: [{ effectAreaId: BIA_CONE_ID, shape: { ...coneShape, reach: 4 } }] },
      ],
      ['effectArea:deletedMany', 'effectAreasDeleted', { effectAreaIds: [BIA_CONE_ID] }],
    ])('a valid %s of the table is a %s event', (name, type, fields) => {
      const payload = { ...base, ...fields };
      expect(parseBoardEvent(name, payload, VHARN.id)).toEqual({
        kind: 'event',
        event: { type, payload },
      });
    });

    it('an orthogonal cone facing 90 with a whole x is outside the DTO and invalid (resync)', () => {
      const broken = { ...biaCone(), kind: 'orthogonal_cone', x: 5, y: 6, facing: 90 };
      const payload = { ...base, effectAreas: [broken] };
      expect(parseBoardEvent('effectArea:createdMany', payload, VHARN.id)).toEqual({
        kind: 'invalid',
      });
    });
  });

  describe('walls', () => {
    const base = { campaignId: VHARN.id, version: 6, at: '2026-10-18T12:00:00.000Z' };

    it.each([
      ['wall:createdMany', 'wallsCreated', { walls: [northWall(), cellDoor()] }],
      ['wall:movedMany', 'wallsMoved', { moves: [{ wallId: NORTH_WALL_ID, x: 3, y: 2 }] }],
      ['wall:deletedMany', 'wallsDeleted', { wallIds: [NORTH_WALL_ID] }],
      [
        'wall:kindsChanged',
        'wallKindsChanged',
        { changes: [{ wallId: NORTH_WALL_ID, kind: 'door', doorState: 'closed' }] },
      ],
      ['wall:doorChanged', 'doorChanged', { wallId: CELL_DOOR_ID, doorState: 'open' }],
      ['wall:areaErased', 'wallAreaErased', { wallIds: [NORTH_WALL_ID], walls: [cellDoor()] }],
      ['wall:segmentErased', 'wallSegmentErased', { wallId: NORTH_WALL_ID, walls: [cellDoor()] }],
    ])('a valid %s of the table is a %s event', (name, type, fields) => {
      const payload = { ...base, ...fields };
      expect(parseBoardEvent(name, payload, VHARN.id)).toEqual({
        kind: 'event',
        event: { type, payload },
      });
    });

    it('a wall:doorChanged with the state "ajar" is outside the DTO and invalid (resync)', () => {
      const payload = { ...base, wallId: CELL_DOOR_ID, doorState: 'ajar' };
      expect(parseBoardEvent('wall:doorChanged', payload, VHARN.id)).toEqual({ kind: 'invalid' });
    });
  });

  describe('lights', () => {
    const base = { campaignId: VHARN.id, version: 6, at: '2026-10-18T12:00:00.000Z' };

    it.each([
      ['light:createdMany', 'lightsCreated', { lights: [corridorTorch()] }],
      ['light:movedMany', 'lightsMoved', { moves: [{ lightId: CORRIDOR_TORCH_ID, x: 3, y: 2 }] }],
      [
        'light:rangesChanged',
        'lightRangesChanged',
        { changes: [{ lightId: CORRIDOR_TORCH_ID, bright: 6, dim: 6 }] },
      ],
      [
        'light:colorsChanged',
        'lightColorsChanged',
        { changes: [{ lightId: CORRIDOR_TORCH_ID, color: 'fire' }] },
      ],
      ['light:litChanged', 'lightsLitChanged', { lightIds: [CORRIDOR_TORCH_ID], lit: false }],
      ['light:deletedMany', 'lightsDeleted', { lightIds: [CORRIDOR_TORCH_ID] }],
    ])('a valid %s of the table is a %s event', (name, type, fields) => {
      const payload = { ...base, ...fields };
      expect(parseBoardEvent(name, payload, VHARN.id)).toEqual({
        kind: 'event',
        event: { type, payload },
      });
    });

    it('a light:colorsChanged with a hex color is outside the DTO and invalid (resync)', () => {
      const payload = { ...base, changes: [{ lightId: CORRIDOR_TORCH_ID, color: '#f00' }] };
      expect(parseBoardEvent('light:colorsChanged', payload, VHARN.id)).toEqual({
        kind: 'invalid',
      });
    });

    it('a light:litChanged with lit "yes" is outside the DTO and invalid (resync)', () => {
      const payload = { ...base, lightIds: [CORRIDOR_TORCH_ID], lit: 'yes' };
      expect(parseBoardEvent('light:litChanged', payload, VHARN.id)).toEqual({ kind: 'invalid' });
    });
  });

  describe('drawings and token batches', () => {
    const base = { campaignId: VHARN.id, version: 6, at: '2026-10-16T12:00:00.000Z' };

    it.each([
      ['drawing:createdMany', 'drawingsCreated', { drawings: [square(), path()] }],
      ['drawing:movedMany', 'drawingsMoved', { moves: [{ drawingId: SQUARE_ID, x: 4.5, y: 1 }] }],
      ['drawing:deletedMany', 'drawingsDeleted', { drawingIds: [SQUARE_ID] }],
      ['token:deletedMany', 'tokensDeleted', { tokenIds: [SQUARE_ID], combat: null }],
    ])('a valid %s of the table is a %s event', (name, type, fields) => {
      const payload = { ...base, ...fields };
      expect(parseBoardEvent(name, payload, VHARN.id)).toEqual({
        kind: 'event',
        event: { type, payload },
      });
    });

    it('a drawing:createdMany with a filled freehand path is outside the DTO and invalid', () => {
      const payload = { ...base, drawings: [{ ...path(), fill: 'ember' }] };
      expect(parseBoardEvent('drawing:createdMany', payload, VHARN.id)).toEqual({
        kind: 'invalid',
      });
    });

    it('a drawing:createdMany of another table is not ours', () => {
      const payload = { ...base, campaignId: QUELM.id, drawings: [square()] };
      expect(parseBoardEvent('drawing:createdMany', payload, VHARN.id)).toEqual({
        kind: 'other-table',
      });
    });
  });
});
