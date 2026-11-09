import { describe, expect, it } from 'vitest';
import { boardCommandTableDto } from '../../src/board/board-event.dto';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';

describe('boardCommandTableDto', () => {
  it('reads the table and lets the other fields pass unread', () => {
    expect(boardCommandTableDto.parse({ campaignId: CAMPAIGN_ID, drawings: [1, 2] })).toEqual({
      campaignId: CAMPAIGN_ID,
    });
  });

  it.each([[{ campaignId: 'nope' }], [{}], [null], [[]]])('refuses %j', (payload) => {
    expect(boardCommandTableDto.safeParse(payload).success).toBe(false);
  });
});
