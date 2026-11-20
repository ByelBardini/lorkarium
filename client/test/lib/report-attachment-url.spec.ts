import { describe, expect, it } from 'vitest';
import { reportAttachmentUrlOf } from '@/lib/report-attachment-url';

describe('reportAttachmentUrlOf', () => {
  it("is the backoffice's route of that screenshot of that report", () => {
    expect(reportAttachmentUrlOf('r-1', 's-2')).toBe('/api/admin/reports/r-1/attachments/s-2');
  });

  it('escapes what is not an id', () => {
    expect(reportAttachmentUrlOf('a/b', 'c?d')).toBe('/api/admin/reports/a%2Fb/attachments/c%3Fd');
  });
});
