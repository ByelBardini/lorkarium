import { describe, expect, it } from 'vitest';
import {
  DirectMessageBo,
  type DirectMessageContext,
} from '../../../src/modules/direct-messages/direct-message.bo';
import { DirectMessageError } from '../../../src/modules/direct-messages/direct-messages.error';
import { ANA_ID } from '../../support/auth-factories';
import { BIA_ID } from '../../support/campaigns-factories';

const DELIVERABLE: DirectMessageContext = {
  senderId: ANA_ID,
  recipientId: BIA_ID,
  friends: true,
  senderVisible: true,
  recipientVisible: true,
};

function codeOf(context: Partial<DirectMessageContext>): string | null {
  try {
    new DirectMessageBo({ ...DELIVERABLE, ...context }).requireDeliverable();
    return null;
  } catch (error) {
    if (error instanceof DirectMessageError) return error.code;
    throw error;
  }
}

describe('DirectMessageBo', () => {
  it('Ana to Bia, friends and both online: it goes', () => {
    expect(codeOf({})).toBeNull();
    expect(new DirectMessageBo(DELIVERABLE).isDeliverable()).toBe(true);
  });

  it('not friends → DM_NOT_FRIENDS, citing both ids', () => {
    expect(() =>
      new DirectMessageBo({ ...DELIVERABLE, friends: false }).requireDeliverable(),
    ).toThrow(`user ${ANA_ID} is not a friend of ${BIA_ID}`);
  });

  it('to oneself → DM_NOT_FRIENDS even if a friendship were read', () => {
    expect(codeOf({ recipientId: ANA_ID })).toBe('DM_NOT_FRIENDS');
  });

  it('Bia offline or invisible → DM_RECIPIENT_OFFLINE (one code for both)', () => {
    expect(codeOf({ recipientVisible: false })).toBe('DM_RECIPIENT_OFFLINE');
  });

  it('Ana invisible → DM_SENDER_INVISIBLE', () => {
    expect(codeOf({ senderVisible: false })).toBe('DM_SENDER_INVISIBLE');
  });

  it('a stranger never learns whether the recipient is online: not friends comes first', () => {
    expect(codeOf({ friends: false, senderVisible: false, recipientVisible: false })).toBe(
      'DM_NOT_FRIENDS',
    );
  });

  it('"digitando…" asks the same rule without throwing', () => {
    expect(new DirectMessageBo({ ...DELIVERABLE, recipientVisible: false }).isDeliverable()).toBe(
      false,
    );
  });
});
