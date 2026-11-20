import { describe, expect, it } from 'vitest';
import { FeedbackBo } from '../../../src/modules/feedback/feedback.bo';
import { BIA_ID } from '../../support/campaigns-factories';
import { feedbackEntryPo } from '../../support/feedback-fakes';

const SHOT_A = '00000000-0000-4000-8000-0000000000b1';
const SHOT_B = '00000000-0000-4000-8000-0000000000b2';

describe('FeedbackBo, who sends', () => {
  it('an active account sends with its @', () => {
    const bia = { username: 'bia', suspended: false };

    expect(FeedbackBo.requireActiveSender(bia, BIA_ID)).toBe(bia);
  });

  it('a suspended account is FEEDBACK_FORBIDDEN citing the id', () => {
    expect(() =>
      FeedbackBo.requireActiveSender({ username: 'bia', suspended: true }, BIA_ID),
    ).toThrow(
      expect.objectContaining({
        code: 'FEEDBACK_FORBIDDEN',
        message: expect.stringContaining(BIA_ID),
      }),
    );
  });

  it('9 waiting pass and the 10th waiting is FEEDBACK_OPEN_LIMIT citing both numbers', () => {
    expect(FeedbackBo.requireWithinWaitingLimit(9, 10, BIA_ID)).toBeUndefined();
    expect(() => FeedbackBo.requireWithinWaitingLimit(10, 10, BIA_ID)).toThrow(
      expect.objectContaining({
        code: 'FEEDBACK_OPEN_LIMIT',
        message: expect.stringMatching(/10 entries waiting: expected fewer than 10/),
      }),
    );
  });
});

describe('FeedbackBo, screenshots and the queue', () => {
  it("someone else's or an already claimed screenshot is ATTACHMENT_NOT_FOUND citing it", () => {
    expect(FeedbackBo.requireClaimable([SHOT_A], [SHOT_A])).toBeUndefined();
    expect(() => FeedbackBo.requireClaimable([SHOT_A, SHOT_B], [SHOT_A])).toThrow(
      expect.objectContaining({
        code: 'ATTACHMENT_NOT_FOUND',
        message: expect.stringContaining(SHOT_B),
      }),
    );
  });

  it('an entry already closed is FEEDBACK_NOT_FOUND citing it', () => {
    const entry = feedbackEntryPo();

    expect(FeedbackBo.requireWaiting(entry, entry.id)).toBe(entry);
    expect(() => FeedbackBo.requireWaiting(undefined, entry.id)).toThrow(
      expect.objectContaining({
        code: 'FEEDBACK_NOT_FOUND',
        message: expect.stringContaining(entry.id),
      }),
    );
  });
});

describe('FeedbackBo.inertMentionsOf', () => {
  it.each([
    ['valeu @bia', 'valeu @<!-- -->bia'],
    ['@bia-flor e @Caio2', '@<!-- -->bia-flor e @<!-- -->Caio2'],
    ['(@org/time)', '(@<!-- -->org/time)'],
    ['linha 1\n@bia no começo', 'linha 1\n@<!-- -->bia no começo'],
  ])('%j pings nobody', (body, inert) => {
    expect(FeedbackBo.inertMentionsOf(body)).toBe(inert);
  });

  it('an e-mail address, a lone @ and code are left as they are', () => {
    const body = 'bia@mesa.com, 2 @ 3, `@bia` e\n```\n@caio\n```\nfim @duda';

    expect(FeedbackBo.inertMentionsOf(body)).toBe(
      'bia@mesa.com, 2 @ 3, `@bia` e\n```\n@caio\n```\nfim @<!-- -->duda',
    );
  });
});
