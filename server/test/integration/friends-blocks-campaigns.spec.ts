import {
  apiErrorDto,
  listPublicCampaignsResponseDto,
  sessionMemberLeftDto,
  sessionRemovedFromTableDto,
} from '@lorkarium/contracts';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { eventPayload } from '../support/live-table';
import { recordEventsOf } from '../support/realtime-client';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

beforeEach(async () => {
  await live.connection.db.execute(
    sql`UPDATE campaigns SET visibility = 'public' WHERE id IN (${live.vharn.id}, ${live.quelm.id})`,
  );
});

function block(blocker: SignedInUser, blocked: SignedInUser) {
  return live.http(blocker, {
    method: 'POST',
    url: '/api/blocks',
    payload: { userId: blocked.id },
  });
}

function joinByCode(user: SignedInUser, table: Table) {
  return live.http(user, {
    method: 'POST',
    url: '/api/campaigns/join',
    payload: { code: table.joinCode },
  });
}

function joinFromExplore(user: SignedInUser, table: Table) {
  return live.http(user, { method: 'POST', url: `/api/campaigns/${table.id}/join`, payload: {} });
}

async function publicIdsSeenBy(user: SignedInUser): Promise<string[]> {
  const response = await live.http(user, { method: 'GET', url: '/api/campaigns/public' });
  return listPublicCampaignsResponseDto.parse(response.json()).campaigns.map((table) => table.id);
}

async function roleOf(user: SignedInUser, table: Table): Promise<string | null> {
  const rows = await live.connection.db.execute<{ role: string }>(
    sql`SELECT role FROM campaign_members WHERE campaign_id = ${table.id} AND user_id = ${user.id}`,
  );
  return rows.rows[0]?.role ?? null;
}

describe('a block by the owner keeps the blocked account out of their tables', () => {
  it('Caio, blocked by Ana, gets the 404 of a missing table by the code and from Explorar', async () => {
    await block(live.ana, live.caio);
    const missing = await joinByCode(live.bia, { ...live.vharn, joinCode: 'ZZZZ2345' });

    const byCode = await joinByCode(live.caio, live.vharn);
    const fromExplore = await joinFromExplore(live.caio, live.vharn);

    for (const refused of [byCode, fromExplore]) {
      expect(refused.statusCode).toBe(404);
      expect(apiErrorDto.parse(refused.json())).toEqual(apiErrorDto.parse(missing.json()));
    }
  });

  it('Vharn leaves the Explorar of Caio only, and Quelm stays', async () => {
    await block(live.ana, live.caio);

    const seenByCaio = await publicIdsSeenBy(live.caio);

    expect(seenByCaio).not.toContain(live.vharn.id);
    expect(seenByCaio).toContain(live.quelm.id);
    expect(await publicIdsSeenBy(live.bia)).toContain(live.vharn.id);
  });

  it('Caio, a player of Vharn, loses the seat: his tab hears removedFromTable, Ana hears memberLeft', async () => {
    const caioTab = recordEventsOf(await live.atTable(live.caio, live.vharn));
    const anaTab = recordEventsOf(await live.atTable(live.ana, live.vharn));

    expect((await block(live.ana, live.caio)).statusCode).toBe(201);

    expect(await roleOf(live.caio, live.vharn)).toBeNull();
    const removed = sessionRemovedFromTableDto.parse(
      await eventPayload(caioTab, 'session:removedFromTable'),
    );
    expect(removed.campaignId).toBe(live.vharn.id);
    const left = sessionMemberLeftDto.parse(await eventPayload(anaTab, 'session:memberLeft'));
    expect(left.userId).toBe(live.caio.id);
  });

  it('a block by Bia, co-master but not the owner of Vharn, keeps Caio in and lets him join again', async () => {
    await live.connection.db.execute(
      sql`UPDATE campaign_members SET role = 'master' WHERE campaign_id = ${live.vharn.id} AND user_id = ${live.bia.id}`,
    );

    await block(live.bia, live.caio);

    expect(await roleOf(live.caio, live.vharn)).toBe('player');
    expect((await joinByCode(live.caio, live.vharn)).statusCode).toBe(200);
  });

  it('after the unblock, Caio joins Vharn again by the code, as a spectator', async () => {
    await block(live.ana, live.caio);
    await live.http(live.ana, { method: 'DELETE', url: `/api/blocks/${live.caio.id}` });

    const response = await joinByCode(live.caio, live.vharn);

    expect(response.statusCode).toBe(200);
    expect(await roleOf(live.caio, live.vharn)).toBe('spectator');
    expect(await publicIdsSeenBy(live.caio)).toContain(live.vharn.id);
  });

  it('the block does not touch a table of another owner where both sit', async () => {
    expect((await joinByCode(live.ana, live.quelm)).statusCode).toBe(200);

    await block(live.ana, live.caio);

    expect(await roleOf(live.ana, live.quelm)).toBe('spectator');
    expect(await roleOf(live.caio, live.quelm)).toBe('master');
  });
});
