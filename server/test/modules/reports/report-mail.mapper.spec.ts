import { describe, expect, it } from 'vitest';
import { reportReviewedMail } from '../../../src/modules/reports/report-mail.mapper';

const PUBLIC_URL = 'https://app.lorkarium.test';
const person = { to: 'bia@mesa.com', name: 'Bia', username: 'bia' };

describe('reportReviewedMail', () => {
  const mail = reportReviewedMail({
    person,
    // 02:30 in UTC is still the 12th in Brasília.
    reportedAt: new Date('2026-11-13T02:30:00Z'),
    publicUrl: PUBLIC_URL,
  });

  it('goes to the reporter with the reviewed subject', () => {
    expect(mail).toMatchObject({ to: 'bia@mesa.com', subject: 'Sua denúncia foi analisada' });
  });

  it('greets by name and tells the day of the report in Brasília time', () => {
    expect(mail.text).toContain('Oi, Bia!');
    expect(mail.text).toContain('12 de novembro de 2026');
  });

  it('says no measure is told and names nobody else', () => {
    expect(mail.text).toContain('não contamos qual medida foi tomada');
    expect(mail.text).not.toMatch(/suspens|exclu|advert|@\w/i);
  });
});
