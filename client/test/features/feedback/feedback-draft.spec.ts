import { describe, expect, it } from 'vitest';
import {
  emptyFeedbackDraft,
  feedbackRequestOf,
  firstMissingOf,
  type FeedbackDraft,
} from '@/features/feedback/feedback-draft';

const WHERE = { platform: 'browser', appVersion: 'Chrome 142' } as const;
const SHOT = '00000000-0000-4000-8000-0000000000f1';

function bugDraft(): FeedbackDraft {
  const empty = emptyFeedbackDraft(WHERE);
  return { ...empty, sections: { ...empty.sections, steps: 'a', expected: 'b', actual: 'c' } };
}

describe('the feedback draft', () => {
  it('starts as a bug with empty sections and where the app was detected', () => {
    expect(emptyFeedbackDraft(WHERE)).toMatchObject({ kind: 'bug', ...WHERE });
    expect(firstMissingOf(emptyFeedbackDraft(WHERE))).toBe('steps');
  });

  it('a section of only spaces is still missing; then the version', () => {
    const draft = bugDraft();

    expect(firstMissingOf({ ...draft, sections: { ...draft.sections, actual: '  ' } })).toBe(
      'actual',
    );
    expect(firstMissingOf({ ...draft, appVersion: ' ' })).toBe('appVersion');
    expect(firstMissingOf(draft)).toBeNull();
  });

  it("a suggestion does not ask for the bug's sections nor the alternatives", () => {
    const draft: FeedbackDraft = {
      ...bugDraft(),
      kind: 'suggestion',
      sections: { ...bugDraft().sections, problem: 'p', idea: 'i' },
    };

    expect(firstMissingOf(draft)).toBeNull();
  });

  it("a bug's request carries only its own sections and the screenshots", () => {
    const draft = { ...bugDraft(), sections: { ...bugDraft().sections, idea: 'esquecida' } };

    expect(feedbackRequestOf(draft, [SHOT])).toEqual({
      content: { kind: 'bug', steps: 'a', expected: 'b', actual: 'c' },
      ...WHERE,
      attachmentIds: [SHOT],
    });
  });

  it('a suggestion without alternatives sends them as null and no screenshots leaves the field out', () => {
    const draft: FeedbackDraft = {
      ...emptyFeedbackDraft(WHERE),
      kind: 'suggestion',
      sections: {
        ...emptyFeedbackDraft(WHERE).sections,
        problem: 'p',
        idea: 'i',
        alternatives: ' ',
      },
    };

    expect(feedbackRequestOf(draft, [])).toEqual({
      content: { kind: 'suggestion', problem: 'p', idea: 'i', alternatives: null },
      ...WHERE,
    });
  });
});
