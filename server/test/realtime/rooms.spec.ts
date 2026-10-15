import { describe, expect, it } from 'vitest';
import { campaignRoom } from '../../src/realtime/rooms';

describe('campaignRoom', () => {
  it('the room of a table is prefixed with campaign:', () => {
    expect(campaignRoom('3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10')).toBe(
      'campaign:3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10',
    );
  });
});
