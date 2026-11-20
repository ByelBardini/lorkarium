import { describe, expect, it } from 'vitest';
import {
  BROADCAST_MAX_ATTEMPTS,
  failureAfter,
  redactedFailure,
} from '../../../src/modules/broadcasts/broadcast-delivery.bo';

describe('failureAfter', () => {
  it('the first failure is tried again in the next cycle', () => {
    expect(failureAfter(0)).toEqual({ attempts: 1, gaveUp: false });
  });

  it('the second failure is still tried again', () => {
    expect(failureAfter(1)).toEqual({ attempts: 2, gaveUp: false });
  });

  it('the third failure gives up', () => {
    expect(BROADCAST_MAX_ATTEMPTS).toBe(3);
    expect(failureAfter(2)).toEqual({ attempts: 3, gaveUp: true });
  });
});

describe('redactedFailure', () => {
  it('takes the address out of the error, whatever its case', () => {
    const error = new Error('550 5.1.1 <Bia@Mesa.com>: Recipient address rejected');
    expect(redactedFailure(error, 'bia@mesa.com')).toBe(
      '550 5.1.1 <destinatário>: Recipient address rejected',
    );
  });

  it('keeps at most 500 characters', () => {
    expect(redactedFailure(new Error('x'.repeat(900)), null)).toHaveLength(500);
  });

  it('a thrown value that is not an Error becomes its text', () => {
    expect(redactedFailure('timeout', null)).toBe('timeout');
  });
});
