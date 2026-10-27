import {
  campaignResponseDto,
  endJuggernautResponseDto,
  listCampaignsResponseDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users } from '../../src/modules/auth/users.po';
import type { SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { useTokenTable } from '../support/token-table';

const live = useTokenTable();

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

async function admin(name: string): Promise<SignedInUser> {
  const user = await live.signUp(name);
  await live.connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, user.id));
  return user;
}

function juggernaut(
  user: SignedInUser | null,
  method: 'POST' | 'DELETE',
  table: Pick<Table, 'id'>,
) {
  return live.http(user, { method, url: `/api/campaigns/${table.id}/juggernaut` });
}

function setRole(user: SignedInUser, targetId: string, role: string) {
  const url = `/api/campaigns/${live.vharn.id}/members/${targetId}`;
  return live.http(user, { method: 'PATCH', url, payload: { role } });
}

async function ermoOfEva(): Promise<Table> {
  const eva = await live.signUp('Eva');
  const payload = { name: 'Ermo', visibility: 'private', password: 'sino' };
  const response = await live.http(eva, { method: 'POST', url: '/api/campaigns', payload });
  const { id, joinCode } = campaignResponseDto.parse(response.json()).campaign;
  return { id, joinCode: joinCode ?? '', master: eva };
}

async function namesListedFor(user: SignedInUser): Promise<string[]> {
  const response = await live.http(user, { method: 'GET', url: '/api/campaigns' });
  return listCampaignsResponseDto.parse(response.json()).campaigns.map(({ name }) => name);
}

function codeOf(response: { statusCode: number; json: () => { code?: string } }) {
  return [response.statusCode, response.json().code];
}

describe('turning juggernaut mode on and off by the route', () => {
  it('Root, an admin, at Ermo (private, with a password, not his): 200 as master with the code', async () => {
    const root = await admin('Root');
    const ermo = await ermoOfEva();

    const response = await juggernaut(root, 'POST', ermo);

    expect(response.statusCode).toBe(200);
    expect(campaignResponseDto.parse(response.json()).campaign).toMatchObject({
      myRole: 'master',
      juggernaut: true,
      joinCode: ermo.joinCode,
    });
  });

  it('Bia, not an admin, is 403 FORBIDDEN_ROLE; without a session it is 401', async () => {
    expect(codeOf(await juggernaut(live.bia, 'POST', live.vharn))).toEqual([403, 'FORBIDDEN_ROLE']);
    expect((await juggernaut(null, 'POST', live.vharn)).statusCode).toBe(401);
  });

  it('a campaign that does not exist is 404 CAMPAIGN_NOT_FOUND', async () => {
    const root = await admin('Root');

    expect(codeOf(await juggernaut(root, 'POST', { id: UNKNOWN_ID }))).toEqual([
      404,
      'CAMPAIGN_NOT_FOUND',
    ]);
  });

  it('Ana, the owner of Vharn and an admin, is 409 ALREADY_OWNER', async () => {
    await live.connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, live.ana.id));

    expect(codeOf(await juggernaut(live.ana, 'POST', live.vharn))).toEqual([409, 'ALREADY_OWNER']);
  });

  it('Root turning it off where he was a player answers player and stays at Vharn as one', async () => {
    const root = await admin('Root');
    await live.joinAsSpectator(root, live.vharn);
    await setRole(live.ana, root.id, 'player');
    await juggernaut(root, 'POST', live.vharn);

    const response = await juggernaut(root, 'DELETE', live.vharn);

    expect(endJuggernautResponseDto.parse(response.json())).toEqual({ myRole: 'player' });
    expect(await namesListedFor(root)).toEqual(['Os Sinos de Vharn']);
  });

  it('Root turning it off where he was not a member answers null and Vharn leaves his list', async () => {
    const root = await admin('Root');
    await juggernaut(root, 'POST', live.vharn);
    expect(await namesListedFor(root)).toEqual(['Os Sinos de Vharn']);

    const response = await juggernaut(root, 'DELETE', live.vharn);

    expect(endJuggernautResponseDto.parse(response.json())).toEqual({ myRole: null });
    expect(await namesListedFor(root)).toEqual([]);
  });

  it('on at Vharn, Root still reaches nothing of Quelm (isolation)', async () => {
    const root = await admin('Root');
    await juggernaut(root, 'POST', live.vharn);

    const quelm = await live.http(root, { method: 'GET', url: `/api/campaigns/${live.quelm.id}` });

    expect(codeOf(quelm)).toEqual([404, 'CAMPAIGN_NOT_FOUND']);
  });
});

describe('Root in juggernaut mode at Vharn', () => {
  it('Ana, the owner, putting Root in player is 403 FORBIDDEN', async () => {
    const root = await admin('Root');
    await juggernaut(root, 'POST', live.vharn);

    expect(codeOf(await setRole(live.ana, root.id, 'player'))).toEqual([403, 'FORBIDDEN']);
  });

  it('demotes Bia, a co-master, and promotes Caio to master: 200 each', async () => {
    const root = await admin('Root');
    await setRole(live.ana, live.bia.id, 'master');
    await juggernaut(root, 'POST', live.vharn);

    const demoted = await setRole(root, live.bia.id, 'player');
    const promoted = await setRole(root, live.caio.id, 'master');

    expect([demoted.statusCode, demoted.json().role]).toEqual([200, 'player']);
    expect([promoted.statusCode, promoted.json().role]).toEqual([200, 'master']);
  });

  it('demoting Ana, the owner, is 403 FORBIDDEN', async () => {
    const root = await admin('Root');
    await juggernaut(root, 'POST', live.vharn);

    expect(codeOf(await setRole(root, live.ana.id, 'player'))).toEqual([403, 'FORBIDDEN']);
  });

  it('deletes Vharn with the table open: 204', async () => {
    const root = await admin('Root');
    await juggernaut(root, 'POST', live.vharn);
    await live.atTable(root, live.vharn);

    const response = await live.http(root, {
      method: 'DELETE',
      url: `/api/campaigns/${live.vharn.id}`,
    });

    expect(response.statusCode).toBe(204);
  });
});
