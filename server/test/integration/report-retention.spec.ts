import { userReportAttachmentResponseDto } from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createReportRetention } from '../../src/modules/reports/reports.plugin';
import { ClockFake } from '../support/auth-fakes';
import { pngOf } from '../support/images';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

const NOW = new Date('2026-11-19T12:00:00Z');

async function shotOf(user: SignedInUser): Promise<string> {
  const headers = { 'content-type': 'image/png' };
  const payload = await pngOf(64, 64);
  const response = await live.http(user, {
    method: 'POST',
    url: '/api/reports/attachments',
    headers,
    payload,
  });
  return userReportAttachmentResponseDto.parse(response.json()).attachment.id;
}

async function reportWith(user: SignedInUser, targetId: string, ids: string[]): Promise<string> {
  const payload = { reason: 'spam', attachmentIds: ids };
  await live.http(user, { method: 'POST', url: `/api/users/${targetId}/reports`, payload });
  const found = await live.connection.db.execute(
    sql`SELECT id FROM user_reports WHERE reporter_id = ${user.id} AND status = 'open'`,
  );
  return (found.rows[0] as { id: string }).id;
}

async function closeAt(reportId: string, closedAt: string): Promise<void> {
  await live.connection.db.execute(
    sql`UPDATE user_reports SET status = 'resolved', resolved_at = ${closedAt} WHERE id = ${reportId}`,
  );
}

async function idsIn(table: 'user_reports' | 'report_attachments'): Promise<string[]> {
  const found = await live.connection.db.execute(sql`SELECT id FROM ${sql.identifier(table)}`);
  return found.rows.map((row) => (row as { id: string }).id);
}

async function queuedKeys(): Promise<string[]> {
  const found = await live.connection.db.execute(
    sql`SELECT key FROM storage_deletions ORDER BY key`,
  );
  return found.rows.map((row) => (row as { key: string }).key);
}

function purge() {
  return createReportRetention(live.connection.db, new ClockFake(NOW)).purge();
}

describe("the reports' retention against Postgres", () => {
  it('a report closed 7 months ago leaves with its screenshots, whose keys enter the queue', async () => {
    const shot = await shotOf(live.bia);
    const old = await reportWith(live.bia, live.caio.id, [shot]);
    await closeAt(old, '2026-04-19T12:00:00Z');
    const recent = await reportWith(live.caio, live.bia.id, []);
    await closeAt(recent, '2026-06-19T12:00:00Z');

    expect(await purge()).toEqual({ reports: 1, looseAttachments: 0 });

    expect(await idsIn('user_reports')).toEqual([recent]);
    expect(await idsIn('report_attachments')).toEqual([]);
    expect(await queuedKeys()).toEqual([`reports/${shot}`]);
  });

  it('an open report a year old stays', async () => {
    const open = await reportWith(live.bia, live.caio.id, []);
    await live.connection.db.execute(
      sql`UPDATE user_reports SET created_at = '2025-11-19T12:00:00Z' WHERE id = ${open}`,
    );

    await purge();

    expect(await idsIn('user_reports')).toEqual([open]);
  });

  it('a loose screenshot over a day old leaves through the queue; a claimed one stays', async () => {
    const loose = await shotOf(live.bia);
    const claimed = await shotOf(live.bia);
    await reportWith(live.bia, live.caio.id, [claimed]);
    await live.connection.db.execute(
      sql`UPDATE report_attachments SET created_at = '2026-11-17T12:00:00Z'`,
    );

    expect(await purge()).toEqual({ reports: 0, looseAttachments: 1 });

    expect(await idsIn('report_attachments')).toEqual([claimed]);
    expect(await queuedKeys()).toEqual([`reports/${loose}`]);
  });
});
