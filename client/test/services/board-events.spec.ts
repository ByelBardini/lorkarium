import { describe, expect, it } from 'vitest';
import { parseBoardEvent, parseVeiledLights } from '@/services/board-events';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { path, SQUARE_ID, square } from '../support/drawing-fixtures';
import { shapeOfEffectArea } from '@/lib/effect-area-shape';
import { BIA_CONE_ID, biaCone } from '../support/effect-area-fixtures';
import {
  BIA_AT_TABLE,
  KAEL_ID,
  LYRA_ID,
  VHARN_GRID,
  conditionDefinition,
  memberCard,
  sceneUpdated,
  veiledLightsChanged,
} from '../support/table-session-fixtures';
import { CELL_DOOR_ID, NORTH_WALL_ID, cellDoor, northWall } from '../support/wall-fixtures';
import { CORRIDOR_TORCH_ID, corridorTorch, veiledTorch } from '../support/light-fixtures';
import { fireAura, goldAura } from '../support/aura-fixtures';

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

  it('an event of the table that names no grid is invalid (resync): every event says its sceneId', () => {
    const withoutGrid: Record<string, unknown> = { ...sceneUpdated() };
    delete withoutGrid.sceneId;
    expect(parseBoardEvent('scene:updated', withoutGrid, VHARN.id)).toEqual({ kind: 'invalid' });
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
    const payload = { ...VHARN_GRID, version: 6, at: '2026-10-16T12:00:00.000Z', ...fields };
    expect(parseBoardEvent(name, payload, VHARN.id)).toEqual({
      kind: 'event',
      event: { type, payload },
    });
  });

  it('a token:facedMany of the table with facing 360 is invalid (resync)', () => {
    const payload = {
      ...VHARN_GRID,
      version: 6,
      at: '2026-10-16T12:00:00.000Z',
      faces: [{ tokenId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a', facing: 360 }],
    };
    expect(parseBoardEvent('token:facedMany', payload, VHARN.id)).toEqual({ kind: 'invalid' });
  });

  it('a token:resizedMany with a quarter cell is invalid (resync)', () => {
    const payload = {
      ...VHARN_GRID,
      version: 6,
      at: '2026-10-16T12:00:00.000Z',
      resizes: [
        { tokenId: '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a', col: 0, row: 0, width: 1.25, height: 1 },
      ],
    };
    expect(parseBoardEvent('token:resizedMany', payload, VHARN.id)).toEqual({ kind: 'invalid' });
  });

  it('a token:layerChanged of the table on an unknown layer is invalid', () => {
    const payload = { ...VHARN_GRID, version: 6, at: '2026-10-16T12:00:00.000Z' };
    const parsed = parseBoardEvent(
      'token:layerChanged',
      { ...payload, tokenIds: [], layer: 'gm' },
      VHARN.id,
    );
    expect(parsed).toEqual({ kind: 'invalid' });
  });

  describe('token auras', () => {
    const base = { ...VHARN_GRID, version: 6, at: '2026-10-25T12:00:00.000Z', tokenIds: [LYRA_ID] };

    it('a token:restyledMany with a fire aura is a tokensRestyled event carrying it', () => {
      const payload = { ...base, style: { aura: fireAura() } };

      expect(parseBoardEvent('token:restyledMany', payload, VHARN.id)).toEqual({
        kind: 'event',
        event: { type: 'tokensRestyled', payload },
      });
    });

    it('a token:restyledMany with an aura of kind glow is invalid (resync)', () => {
      const payload = { ...base, style: { aura: { ...goldAura(), kind: 'glow' } } };

      expect(parseBoardEvent('token:restyledMany', payload, VHARN.id)).toEqual({ kind: 'invalid' });
    });
  });

  describe('effect areas', () => {
    const base = { ...VHARN_GRID, version: 6, at: '2026-10-18T12:00:00.000Z' };
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
    const base = { ...VHARN_GRID, version: 6, at: '2026-10-18T12:00:00.000Z' };

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
    const base = { ...VHARN_GRID, version: 6, at: '2026-10-18T12:00:00.000Z' };

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
      [
        'light:conesChanged',
        'lightConesChanged',
        { changes: [{ lightId: CORRIDOR_TORCH_ID, facing: 90, angle: 60 }] },
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

    it('a light:conesChanged with an angle of 0 is outside the DTO and invalid (resync)', () => {
      const payload = { ...base, changes: [{ lightId: CORRIDOR_TORCH_ID, facing: 90, angle: 0 }] };
      expect(parseBoardEvent('light:conesChanged', payload, VHARN.id)).toEqual({ kind: 'invalid' });
    });

    it('a light:litChanged with lit "yes" is outside the DTO and invalid (resync)', () => {
      const payload = { ...base, lightIds: [CORRIDOR_TORCH_ID], lit: 'yes' };
      expect(parseBoardEvent('light:litChanged', payload, VHARN.id)).toEqual({ kind: 'invalid' });
    });
  });

  describe('drawings and token batches', () => {
    const base = { ...VHARN_GRID, version: 6, at: '2026-10-16T12:00:00.000Z' };

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

  describe('token:mainChanged', () => {
    const changed = {
      ...VHARN_GRID,
      version: 6,
      at: '2026-10-21T12:00:00.000Z',
      userId: BIA_AT_TABLE.userId,
      tokenId: KAEL_ID,
    };

    it('a valid token:mainChanged of the table is a mainTokenChanged event', () => {
      expect(parseBoardEvent('token:mainChanged', changed, VHARN.id)).toEqual({
        kind: 'event',
        event: { type: 'mainTokenChanged', payload: changed },
      });
    });

    it('a token:mainChanged whose tokenId is not a uuid is invalid (resync)', () => {
      const malformed = { ...changed, tokenId: 'kael' };
      expect(parseBoardEvent('token:mainChanged', malformed, VHARN.id)).toEqual({
        kind: 'invalid',
      });
    });
  });

  describe('member:cardChanged', () => {
    const changed = {
      ...VHARN_GRID,
      version: 6,
      at: '2026-10-22T12:00:00.000Z',
      card: memberCard({ armorClass: 15 }),
    };

    it('a valid member:cardChanged of the table is a memberCardChanged event', () => {
      expect(parseBoardEvent('member:cardChanged', changed, VHARN.id)).toEqual({
        kind: 'event',
        event: { type: 'memberCardChanged', payload: changed },
      });
    });

    it('a member:cardChanged without the whole card is invalid (resync)', () => {
      const malformed = { ...changed, card: { userId: BIA_AT_TABLE.userId, armorClass: 15 } };
      expect(parseBoardEvent('member:cardChanged', malformed, VHARN.id)).toEqual({
        kind: 'invalid',
      });
    });
  });

  describe('condition:changedMany', () => {
    const changed = {
      ...VHARN_GRID,
      version: 6,
      at: '2026-10-22T12:00:00.000Z',
      changes: [{ tokenId: KAEL_ID, conditions: [] }],
    };

    it('a valid condition:changedMany of the table is a conditionsChanged event', () => {
      expect(parseBoardEvent('condition:changedMany', changed, VHARN.id)).toEqual({
        kind: 'event',
        event: { type: 'conditionsChanged', payload: changed },
      });
    });

    it('a condition:changedMany without the changes is invalid (resync)', () => {
      const malformed: Record<string, unknown> = { ...changed };
      delete malformed.changes;
      expect(parseBoardEvent('condition:changedMany', malformed, VHARN.id)).toEqual({
        kind: 'invalid',
      });
    });
  });

  describe('the table list of conditions', () => {
    const base = { ...VHARN_GRID, version: 6, at: '2026-10-24T12:00:00.000Z' };
    const edited = conditionDefinition({ description: 'Desvantagem em ataques.' });

    it.each([
      ['condition:definitionUpdated', 'conditionDefinitionUpdated', { definition: edited }],
      ['condition:definitionDeleted', 'conditionDefinitionDeleted', { conditionId: edited.id }],
      ['condition:defaultsRestored', 'conditionDefaultsRestored', { definitions: [edited] }],
    ])('a valid %s of the table is a %s event', (name, type, fields) => {
      const payload = { ...base, ...fields };
      expect(parseBoardEvent(name, payload, VHARN.id)).toEqual({
        kind: 'event',
        event: { type, payload },
      });
    });

    it('a condition:definitionUpdated whose definition has no description is invalid (resync)', () => {
      const withoutDescription: Record<string, unknown> = { ...edited };
      delete withoutDescription.description;
      const payload = { ...base, definition: withoutDescription };
      expect(parseBoardEvent('condition:definitionUpdated', payload, VHARN.id)).toEqual({
        kind: 'invalid',
      });
    });

    it('a condition:defaultsRestored with a definition without description is invalid (resync)', () => {
      const withoutDescription: Record<string, unknown> = { ...edited };
      delete withoutDescription.description;
      const payload = { ...base, definitions: [withoutDescription] };
      expect(parseBoardEvent('condition:defaultsRestored', payload, VHARN.id)).toEqual({
        kind: 'invalid',
      });
    });

    it('a condition:definitionDeleted whose conditionId is not a uuid is invalid (resync)', () => {
      const payload = { ...base, conditionId: 'envenenado' };
      expect(parseBoardEvent('condition:definitionDeleted', payload, VHARN.id)).toEqual({
        kind: 'invalid',
      });
    });
  });

  describe('hidden tokens', () => {
    const base = { ...VHARN_GRID, version: 6, at: '2026-10-24T12:00:00.000Z' };

    it('a board:advanced of the table is a boardAdvanced event with only its version', () => {
      expect(parseBoardEvent('board:advanced', base, VHARN.id)).toEqual({
        kind: 'event',
        event: { type: 'boardAdvanced', payload: base },
      });
    });

    it('a board:advanced carrying a tokenId is invalid (resync): it must say nothing more', () => {
      const leaking = { ...base, tokenId: LYRA_ID };
      expect(parseBoardEvent('board:advanced', leaking, VHARN.id)).toEqual({ kind: 'invalid' });
    });

    it('a valid token:hiddenChanged of the table is a tokensHiddenChanged event', () => {
      const payload = { ...base, tokenIds: [LYRA_ID, KAEL_ID], hidden: true };
      expect(parseBoardEvent('token:hiddenChanged', payload, VHARN.id)).toEqual({
        kind: 'event',
        event: { type: 'tokensHiddenChanged', payload },
      });
    });

    it('a token:hiddenChanged with hidden "yes" is invalid (resync)', () => {
      const payload = { ...base, tokenIds: [LYRA_ID], hidden: 'yes' };
      expect(parseBoardEvent('token:hiddenChanged', payload, VHARN.id)).toEqual({
        kind: 'invalid',
      });
    });
  });
});

describe('parseVeiledLights', () => {
  it('a valid token:veiledLightsChanged of the table gives the whole list', () => {
    const payload = veiledLightsChanged([veiledTorch()]);
    expect(parseVeiledLights(payload, VHARN.id)).toEqual(payload);
  });

  it('a veiled light with bright 101 is dropped (null): unversioned, it confirmed nothing', () => {
    const payload = veiledLightsChanged([veiledTorch({ bright: 101 })]);
    expect(parseVeiledLights(payload, VHARN.id)).toBeNull();
  });

  it('a veiled light carrying the token id is dropped: the list never names a token', () => {
    const payload = {
      ...veiledLightsChanged([]),
      lights: [{ ...veiledTorch(), tokenId: LYRA_ID }],
    };
    expect(parseVeiledLights(payload, VHARN.id)).toBeNull();
  });

  it('the lights of another table are not this one', () => {
    const payload = veiledLightsChanged([veiledTorch()], { campaignId: QUELM.id });
    expect(parseVeiledLights(payload, VHARN.id)).toBeNull();
  });
});
