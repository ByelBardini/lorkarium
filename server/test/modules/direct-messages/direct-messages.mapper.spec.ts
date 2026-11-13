import { describe, expect, it } from 'vitest';
import {
  toDmSentDto,
  toDmTypingFromDto,
} from '../../../src/modules/direct-messages/direct-messages.mapper';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID } from '../../support/campaigns-factories';

const AT = new Date('2026-11-12T12:00:00Z');
const MESSAGE_ID = '7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d';

describe('direct messages mapper', () => {
  it('a message goes out with the instant as ISO text', () => {
    const message = { messageId: MESSAGE_ID, fromUserId: ANA_ID, toUserId: BIA_ID, text: 'oi' };

    expect(toDmSentDto({ ...message, at: AT })).toEqual({ ...message, at: AT.toISOString() });
  });

  it('"digitando…" carries who types and when', () => {
    expect(toDmTypingFromDto(ANA_ID, AT)).toEqual({ fromUserId: ANA_ID, at: AT.toISOString() });
  });
});
