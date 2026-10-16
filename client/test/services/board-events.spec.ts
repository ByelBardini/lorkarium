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
});
