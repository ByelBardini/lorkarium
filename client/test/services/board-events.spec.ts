import { describe, expect, it } from 'vitest';
import { parseBoardEvent } from '@/services/board-events';
import { QUELM, VHARN } from '../support/campaigns-api-fake';
import { sceneUpdated } from '../support/table-session-fixtures';

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
  ])('a valid %s of the table is a %s event', (name, type, fields) => {
    const payload = { campaignId: VHARN.id, version: 6, at: '2026-10-16T12:00:00.000Z', ...fields };
    expect(parseBoardEvent(name, payload, VHARN.id)).toEqual({
      kind: 'event',
      event: { type, payload },
    });
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
});
