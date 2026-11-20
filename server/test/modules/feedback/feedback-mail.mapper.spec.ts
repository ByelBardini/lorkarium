import { describe, expect, it } from 'vitest';
import { feedbackPublishedMail } from '../../../src/modules/feedback/feedback-mail.mapper';

const ISSUE_URL = 'https://github.com/ByelBardini/lorkarium/issues/42';

describe('feedbackPublishedMail', () => {
  const mail = feedbackPublishedMail({
    person: { to: 'bia@mesa.com', name: 'Bia', username: 'bia' },
    // 02:30 in UTC is still the 12th in Brasília.
    sentAt: new Date('2026-11-13T02:30:00Z'),
    issueUrl: ISSUE_URL,
    issueNumber: 42,
    publicUrl: 'https://app.lorkarium.test',
  });

  it('goes to the sender with the issue number in the subject', () => {
    expect(mail.to).toBe('bia@mesa.com');
    expect(mail.subject).toBe('Seu relato virou a issue #42');
  });

  it('names the day it was sent in Brasília and links the issue, in the button and as text', () => {
    expect(mail.text).toContain('12 de novembro de 2026');
    expect(mail.html).toContain(`href="${ISSUE_URL}"`);
    expect(mail.text).toContain(ISSUE_URL);
  });

  it('says the @, the e-mail and the screenshots stayed out', () => {
    expect(mail.text).toContain('seu @, seu e-mail e os prints ficaram de fora');
  });
});
