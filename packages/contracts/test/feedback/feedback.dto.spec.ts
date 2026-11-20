import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_ISSUE_BODY_MAX_LENGTH,
  FEEDBACK_ISSUE_TITLE_MAX_LENGTH,
  FEEDBACK_TEXT_MAX_LENGTH,
  feedbackRequestDto,
  publishFeedbackRequestDto,
  publishFeedbackResponseDto,
} from '../../src/feedback/feedback.dto';

const SHOT_A = '00000000-0000-4000-8000-0000000000b1';
const SHOT_B = '00000000-0000-4000-8000-0000000000b2';

const BUG = {
  content: {
    kind: 'bug',
    steps: '1. Abri a mesa\n2. Arrastei o token',
    expected: 'O token andar',
    actual: 'O token voltou',
  },
  platform: 'browser',
  appVersion: 'Chrome 142',
} as const;

const SUGGESTION = {
  content: { kind: 'suggestion', problem: 'Sem atalho para o dado', idea: 'Tecla D rola 1d20' },
  platform: 'desktop',
  appVersion: 'Lorkarium 0.3.1',
} as const;

function issuesOf(input: unknown): string[] {
  return feedbackRequestDto.safeParse(input).error?.issues.map((issue) => issue.message) ?? [];
}

describe('feedbackRequestDto', () => {
  it('a bug with its three sections, platform, version and two screenshots is accepted trimmed', () => {
    const parsed = feedbackRequestDto.parse({
      ...BUG,
      content: { ...BUG.content, actual: '  O token voltou  ' },
      attachmentIds: [SHOT_A, SHOT_B],
    });

    expect(parsed.content).toEqual({ ...BUG.content, actual: 'O token voltou' });
    expect(parsed.attachmentIds).toEqual([SHOT_A, SHOT_B]);
  });

  it('a suggestion without alternatives keeps them null', () => {
    const parsed = feedbackRequestDto.parse(SUGGESTION);

    expect(parsed.content).toEqual({ ...SUGGESTION.content, alternatives: null });
  });

  it('a section of 2000 characters passes and one of 2001 is refused citing the limit', () => {
    const long = (length: number): unknown => ({
      ...BUG,
      content: { ...BUG.content, steps: 'x'.repeat(length) },
    });

    expect(feedbackRequestDto.safeParse(long(FEEDBACK_TEXT_MAX_LENGTH)).success).toBe(true);
    expect(issuesOf(long(FEEDBACK_TEXT_MAX_LENGTH + 1)).join()).toContain('2000');
  });

  it('a section of only spaces is refused naming the section', () => {
    expect(issuesOf({ ...BUG, content: { ...BUG.content, expected: '   ' } }).join()).toContain(
      'expected',
    );
  });

  it('six screenshots are refused citing the count', () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => `00000000-0000-4000-8000-00000000000${n}`);

    expect(issuesOf({ ...BUG, attachmentIds: six })).toContain('6 attachments: expected at most 5');
  });

  it("a bug carrying a suggestion's section is refused (strict)", () => {
    expect(
      feedbackRequestDto.safeParse({ ...BUG, content: { ...BUG.content, idea: 'x' } }).success,
    ).toBe(false);
  });

  it('a platform other than the browser or the desktop app is refused citing it', () => {
    expect(issuesOf({ ...BUG, platform: 'linux' }).join()).toContain('"linux"');
  });

  it('the sender never comes in the body (strict)', () => {
    expect(feedbackRequestDto.safeParse({ ...BUG, userId: SHOT_A }).success).toBe(false);
  });
});

describe('publishFeedbackRequestDto', () => {
  const body = 'Corpo revisado';

  it('a title and a body edited by the admin are accepted trimmed', () => {
    expect(publishFeedbackRequestDto.parse({ title: ' [bug] Token volta ', body })).toEqual({
      title: '[bug] Token volta',
      body,
    });
  });

  it('an empty title and one past 256 characters are refused', () => {
    expect(publishFeedbackRequestDto.safeParse({ title: '  ', body }).success).toBe(false);
    const title = 'x'.repeat(FEEDBACK_ISSUE_TITLE_MAX_LENGTH + 1);
    expect(publishFeedbackRequestDto.safeParse({ title, body }).success).toBe(false);
  });

  it("a body past GitHub's 65536 characters is refused", () => {
    const tooLong = 'x'.repeat(FEEDBACK_ISSUE_BODY_MAX_LENGTH + 1);

    expect(publishFeedbackRequestDto.safeParse({ title: 'ok', body: tooLong }).success).toBe(false);
  });
});

describe('publishFeedbackResponseDto', () => {
  it('only a github.com https link is the issue link', () => {
    const url = 'https://github.com/ByelBardini/lorkarium/issues/42';

    expect(publishFeedbackResponseDto.parse({ issueUrl: url, issueNumber: 42 }).issueNumber).toBe(
      42,
    );
    expect(
      publishFeedbackResponseDto.safeParse({ issueUrl: 'https://evil.test/x', issueNumber: 42 })
        .success,
    ).toBe(false);
  });
});
