import { apiErrorDto, campaignResponseDto, type UserPlan } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { UsersDao } from '../../src/modules/auth/users.dao';
import { users } from '../../src/modules/auth/users.po';
import { CampaignMembersDao } from '../../src/modules/campaigns/campaign-members.dao';
import type { CampaignMemberPo } from '../../src/modules/campaigns/campaign-members.po';
import { campaigns } from '../../src/modules/campaigns/campaigns.po';
import { newUserPo } from '../support/auth-factories';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import type { Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

type Role = CampaignMemberPo['role'];

describe("the members of a table hold to its owner's plan", () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let ana: SignedInUser;
  let bia: SignedInUser;
  let vharn: Table;
  let fillers = 0;

  beforeAll(async () => {
    connection = await openTestDatabase();
  });

  afterAll(() => connection.close());

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    ana = await signUpAndLogin(app, connection.db, 'Ana');
    bia = await signUpAndLogin(app, connection.db, 'Bia');
    vharn = await createTable(ana, 'Os Sinos de Vharn');
    await planOf(ana.id, 'free');
  });

  async function createTable(master: SignedInUser, name: string): Promise<Table> {
    const response = await http(master, 'POST', '/campaigns', { name });
    const { id, joinCode } = campaignResponseDto.parse(response.json()).campaign;
    if (!joinCode) throw new Error(`campaign ${id} came back without a join code`);
    return { id, joinCode, master };
  }

  function http(
    user: SignedInUser,
    method: 'POST' | 'PATCH',
    url: string,
    payload: object = {},
  ): Promise<LightMyRequestResponse> {
    const cookies = { lk_session: user.token };
    return app.inject({ method, url: `/api${url}`, cookies, payload });
  }

  async function planOf(userId: string, plan: UserPlan): Promise<void> {
    await connection.db.update(users).set({ plan }).where(eq(users.id, userId));
  }

  // Members put straight in the table: only the one under test goes through the route.
  async function seat(campaignId: string, role: Role, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      fillers += 1;
      const email = `membro${fillers}@mesa.com`;
      const user = await new UsersDao(connection.db).insert(newUserPo({ email, name: email }));
      const joinedAt = new Date();
      await new CampaignMembersDao(connection.db).insert({
        ...{ campaignId, userId: user.id, role, joinedAt },
      });
      ids.push(user.id);
    }
    return ids;
  }

  const joinByCode = (user: SignedInUser, table: Table = vharn) =>
    http(user, 'POST', '/campaigns/join', { code: table.joinCode });

  const setRole = (targetId: string, role: Role) =>
    http(ana, 'PATCH', `/campaigns/${vharn.id}/members/${targetId}`, { role });

  function expectPlanLimit(response: LightMyRequestResponse, resource: string, limit: number) {
    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json())).toMatchObject({
      code: 'PLAN_LIMIT',
      planLimit: { resource, limit, plan: 'free' },
    });
  }

  async function roleOf(userId: string): Promise<Role | undefined> {
    return (await new CampaignMembersDao(connection.db).findMembership(vharn.id, userId))?.role;
  }

  describe('the entry, always as a spectator', () => {
    it('a third spectator of a free table is refused by the code with PLAN_LIMIT and gets no seat', async () => {
      await seat(vharn.id, 'spectator', 2);
      expectPlanLimit(await joinByCode(bia), 'spectators', 2);
      expect(await roleOf(bia.id)).toBeUndefined();
    });

    it('the same ceiling holds for the entry from "Explorar mesas"', async () => {
      await connection.db
        .update(campaigns)
        .set({ visibility: 'public' })
        .where(eq(campaigns.id, vharn.id));
      await seat(vharn.id, 'spectator', 2);
      expectPlanLimit(await http(bia, 'POST', `/campaigns/${vharn.id}/join`), 'spectators', 2);
    });

    it('with one spectator, the second enters', async () => {
      await seat(vharn.id, 'spectator', 1);
      expect((await joinByCode(bia)).statusCode).toBe(200);
      expect(await roleOf(bia.id)).toBe('spectator');
    });

    it('a plan changed in the backoffice counts at once: amigo_do_dono lets the third in', async () => {
      await seat(vharn.id, 'spectator', 2);
      await planOf(ana.id, 'amigo_do_dono');
      expect((await joinByCode(bia)).statusCode).toBe(200);
    });
  });

  describe('the promotion, by the destination role', () => {
    it('promoting to player with six players is PLAN_LIMIT players and keeps the role', async () => {
      await seat(vharn.id, 'player', 6);
      const [duda = ''] = await seat(vharn.id, 'spectator', 1);
      expectPlanLimit(await setRole(duda, 'player'), 'players', 6);
      expect(await roleOf(duda)).toBe('spectator');
    });

    it('promoting to master with one co-master is PLAN_LIMIT masters: the owner takes no seat', async () => {
      await seat(vharn.id, 'master', 1);
      const [duda = ''] = await seat(vharn.id, 'player', 1);
      expectPlanLimit(await setRole(duda, 'master'), 'masters', 1);
      expect(await roleOf(duda)).toBe('player');
    });

    it('the first co-master of a free table is promoted', async () => {
      const [duda = ''] = await seat(vharn.id, 'player', 1);
      expect((await setRole(duda, 'master')).statusCode).toBe(200);
    });

    it('moving a player to the spectators of a table with two of them passes', async () => {
      await seat(vharn.id, 'spectator', 2);
      const [duda = ''] = await seat(vharn.id, 'player', 1);
      expect((await setRole(duda, 'spectator')).statusCode).toBe(200);
      expect(await roleOf(duda)).toBe('spectator');
    });
  });

  describe('a juggernaut', () => {
    it('enters a full table and takes no seat: a co-master is still promoted after it', async () => {
      await seat(vharn.id, 'spectator', 2);
      await seat(vharn.id, 'player', 6);
      await connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, bia.id));
      expect((await http(bia, 'POST', `/campaigns/${vharn.id}/juggernaut`)).statusCode).toBe(200);
      const [duda = ''] = await seat(vharn.id, 'player', 1);
      expect((await setRole(duda, 'master')).statusCode).toBe(200);
    });
  });

  describe('isolation', () => {
    it('the members of Quelm do not count against Vharn', async () => {
      const caio = await signUpAndLogin(app, connection.db, 'Caio');
      const quelm = await createTable(caio, 'Quelm');
      await seat(quelm.id, 'spectator', 2);
      await seat(quelm.id, 'player', 6);
      expect((await joinByCode(bia)).statusCode).toBe(200);
      expect((await setRole(bia.id, 'player')).statusCode).toBe(200);
    });
  });

  describe('CampaignMembersDao.countByRole', () => {
    it('counts the role without the owner nor a juggernaut, only in the asked table', async () => {
      await seat(vharn.id, 'master', 1);
      const members = new CampaignMembersDao(connection.db);
      const [root = ''] = await seat(vharn.id, 'spectator', 1);
      await members.startJuggernaut(vharn.id, root, new Date());
      expect(await members.countByRole(vharn.id, 'master')).toBe(1);
      expect(await members.countByRole(vharn.id, 'spectator')).toBe(0);
    });
  });
});
