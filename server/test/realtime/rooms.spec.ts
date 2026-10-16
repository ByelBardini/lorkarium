import { describe, expect, it } from 'vitest';
import { campaignMastersRoom, campaignRoom, campaignUserRoom } from '../../src/realtime/rooms';

describe('campaignRoom', () => {
  it('the room of a table is prefixed with campaign:', () => {
    expect(campaignRoom('3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10')).toBe(
      'campaign:3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10',
    );
  });
});

describe('audience rooms', () => {
  const CAMPAIGN = '3b1e9a52-6c4d-4f8a-9e2b-1a7c5d3f8e10';
  const USER = '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f';

  it('the room of one user sits under the table room', () => {
    expect(campaignUserRoom(CAMPAIGN, USER)).toBe(`campaign:${CAMPAIGN}:user:${USER}`);
  });

  it('the masters room sits under the table room', () => {
    expect(campaignMastersRoom(CAMPAIGN)).toBe(`campaign:${CAMPAIGN}:masters`);
  });

  it('two users of one table never share a room', () => {
    expect(campaignUserRoom(CAMPAIGN, USER)).not.toBe(campaignUserRoom(CAMPAIGN, CAMPAIGN));
  });
});
