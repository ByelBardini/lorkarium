import { userReportResponseDto, userReportsPageDto } from '@lorkarium/contracts';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/modules/auth/users.po';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import type { SignedInUser } from '../support/sign-in';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const REPORTS_PER_MINUTE = 5;

async function admin(name: string): Promise<SignedInUser> {
  const user = await live.signUp(name);
  await live.connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
  return user;
}

function report(user: SignedInUser | null, targetId: string, payload: object = { reason: 'spam' }) {
  return live.http(user, { method: 'POST', url: `/api/users/${targetId}/reports`, payload });
}

function queue(user: SignedInUser | null, query = '') {
  return live.http(user, { method: 'GET', url: `/api/admin/reports${query}` });
}

function close(user: SignedInUser | null, reportId: string, status: string) {
  const url = `/api/admin/reports/${reportId}`;
  return live.http(user, { method: 'PATCH', url, payload: { status } });
}

async function openReportsOf(root: SignedInUser) {
  return userReportsPageDto.parse((await queue(root)).json()).reports;
}

async function reportRowCount(): Promise<number> {
  const counted = await live.connection.db.execute(
    sql`SELECT count(*)::int AS total FROM user_reports`,
  );
  return (counted.rows[0] as { total: number }).total;
}

function codeOf(response: { statusCode: number; json: () => { code?: string } }) {
  return [response.statusCode, response.json().code];
}

describe('reporting an account over HTTP', () => {
  it('POST answers 201 with no body and the admin sees it with both @', async () => {
    const root = await admin('Root');

    const response = await report(live.bia, live.caio.id, { reason: 'harassment', details: 'x' });

    expect(response.statusCode).toBe(201);
    expect(response.body).toBe('');
    const [listed] = await openReportsOf(root);
    expect(listed).toMatchObject({
      reason: 'harassment',
      details: 'x',
      status: 'open',
      reporter: { id: live.bia.id, username: 'bia' },
      target: { id: live.caio.id, username: 'caio' },
      resolvedBy: null,
    });
  });

  it('a second open report on the same account is 409 REPORT_ALREADY_OPEN', async () => {
    await report(live.bia, live.caio.id);

    expect(codeOf(await report(live.bia, live.caio.id))).toEqual([409, 'REPORT_ALREADY_OPEN']);
    expect(await reportRowCount()).toBe(1);
  });

  it('reporting oneself is 400, an unknown account 404, no session 401', async () => {
    expect(codeOf(await report(live.bia, live.bia.id))).toEqual([400, 'REPORT_SELF']);
    expect(codeOf(await report(live.bia, UNKNOWN_ID))).toEqual([404, 'REPORT_TARGET_NOT_FOUND']);
    expect((await report(null, live.caio.id)).statusCode).toBe(401);
  });

  it('a table both play is kept with its name and survives the table being deleted', async () => {
    const root = await admin('Root');
    const payload = { reason: 'harassment', campaignId: live.vharn.id };
    expect((await report(live.bia, live.caio.id, payload)).statusCode).toBe(201);

    await live.connection.db.delete(campaigns).where(eq(campaigns.id, live.vharn.id));

    const [listed] = await openReportsOf(root);
    expect(listed).toMatchObject({ campaignId: null, campaignName: 'Os Sinos de Vharn' });
  });

  // Isolation: Quelm is Caio's table alone; Bia only shares Vharn with him.
  it('a table only the reported account plays is 400 CAMPAIGN_NOT_SHARED and nothing is kept', async () => {
    const payload = { reason: 'harassment', campaignId: live.quelm.id };

    expect(codeOf(await report(live.bia, live.caio.id, payload))).toEqual([
      400,
      'CAMPAIGN_NOT_SHARED',
    ]);
    expect(await reportRowCount()).toBe(0);
  });

  it('a table the reporter only watches as a spectator is CAMPAIGN_NOT_SHARED', async () => {
    const duda = await live.signUp('Duda');
    await live.joinAsSpectator(duda, live.vharn);
    const payload = { reason: 'spam', campaignId: live.vharn.id };

    expect(codeOf(await report(duda, live.caio.id, payload))).toEqual([400, 'CAMPAIGN_NOT_SHARED']);
  });

  it('an unknown reason is 400 and nothing is kept', async () => {
    expect((await report(live.bia, live.caio.id, { reason: 'rude' })).statusCode).toBe(400);
    expect(await reportRowCount()).toBe(0);
  });

  it(`past ${REPORTS_PER_MINUTE} reports a minute the next is 429`, async () => {
    for (let index = 0; index < REPORTS_PER_MINUTE; index += 1) {
      await report(live.bia, live.caio.id);
    }

    const response = await report(live.bia, live.ana.id);

    expect(codeOf(response)).toEqual([429, 'RATE_LIMITED']);
    expect(response.json()).toHaveProperty('retryAfterSeconds');
  });
});

describe('the backoffice queue of reports', () => {
  it('a non-admin is 403 on the list and on closing', async () => {
    await report(live.bia, live.caio.id);

    expect((await queue(live.caio)).statusCode).toBe(403);
    expect((await close(live.caio, UNKNOWN_ID, 'resolved')).statusCode).toBe(403);
  });

  it('lists the open ones oldest first, paged, with the total', async () => {
    const root = await admin('Root');
    await report(live.bia, live.caio.id);
    await report(live.ana, live.caio.id);

    const page = userReportsPageDto.parse((await queue(root, '?page=2')).json());

    expect(page).toMatchObject({ page: 2, pageSize: 50, total: 2, reports: [] });
    const first = await openReportsOf(root);
    expect(first.map((listed) => listed.reporter.username)).toEqual(['bia', 'ana']);
  });

  it("PATCH resolves, records the admin's @ and the date, and leaves the open list", async () => {
    const root = await admin('Root');
    await report(live.bia, live.caio.id);
    const [open] = await openReportsOf(root);

    const response = await close(root, open!.id, 'resolved');

    expect(response.statusCode).toBe(200);
    const { report: closed } = userReportResponseDto.parse(response.json());
    expect(closed).toMatchObject({ status: 'resolved', resolvedBy: 'root' });
    expect(closed.resolvedAt).not.toBeNull();
    expect(await openReportsOf(root)).toEqual([]);
  });

  it('a dismissed report shows under its status, and closing it again is 404', async () => {
    const root = await admin('Root');
    await report(live.bia, live.caio.id);
    const [open] = await openReportsOf(root);
    await close(root, open!.id, 'dismissed');

    const dismissed = userReportsPageDto.parse((await queue(root, '?status=dismissed')).json());

    expect(dismissed.reports.map((listed) => listed.id)).toEqual([open!.id]);
    expect(codeOf(await close(root, open!.id, 'resolved'))).toEqual([404, 'REPORT_NOT_FOUND']);
  });

  it('PATCH back to open is 400', async () => {
    const root = await admin('Root');
    await report(live.bia, live.caio.id);
    const [open] = await openReportsOf(root);

    expect((await close(root, open!.id, 'open')).statusCode).toBe(400);
  });

  it('once closed, the same pair may report again', async () => {
    const root = await admin('Root');
    await report(live.bia, live.caio.id);
    const [open] = await openReportsOf(root);
    await close(root, open!.id, 'resolved');

    expect((await report(live.bia, live.caio.id)).statusCode).toBe(201);
  });

  it('deleting both accounts keeps the report with null ids and the @ and name of the time', async () => {
    const root = await admin('Root');
    await report(live.bia, live.caio.id);

    await live.connection.db.delete(users).where(eq(users.id, live.caio.id));
    await live.connection.db.delete(users).where(eq(users.id, live.bia.id));

    expect(await reportRowCount()).toBe(1);
    const [kept] = await openReportsOf(root);
    expect(kept).toMatchObject({
      reporter: { id: null, username: 'bia' },
      target: { id: null, username: 'caio', name: 'Caio' },
    });
  });

  it('closing keeps the admin note', async () => {
    const root = await admin('Root');
    await report(live.bia, live.caio.id);
    const [open] = await openReportsOf(root);
    const url = `/api/admin/reports/${open!.id}`;

    const response = await live.http(root, {
      method: 'PATCH',
      url,
      payload: { status: 'resolved', note: ' warned in Vharn ' },
    });

    expect(userReportResponseDto.parse(response.json()).report.adminNote).toBe('warned in Vharn');
  });

  it('deleting the admin keeps the closed report with resolvedBy null', async () => {
    const root = await admin('Root');
    await report(live.bia, live.caio.id);
    const [open] = await openReportsOf(root);
    await close(root, open!.id, 'resolved');

    await live.connection.db.delete(users).where(eq(users.id, root.id));

    const other = await admin('Rita');
    const page = userReportsPageDto.parse((await queue(other, '?status=resolved')).json());
    expect(page.reports).toMatchObject([{ id: open!.id, resolvedBy: null }]);
  });
});
