import {
  PLAN_LIMITS,
  adminDirectoryResponseDto,
  campaignResponseDto,
  meResponseDto,
  profileResponseDto,
  sessionJoinAckDto,
  type AdminUserDto,
  type AuthUserDto,
  type CampaignDetailDto,
  type ProfileDto,
  type SessionMemberDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { users } from '../../src/modules/auth/users.po';
import { connectRealtime, type RealtimeClient } from '../support/realtime-client';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { createTable, joinByCode, type Table } from '../support/tables';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

// Bia and Caio are born free; Root is a global admin. OWNER_USERNAME picks who is the Dono, on
// the env of the app and on the connections of the database, as `src/index.ts` wires them.
class OwnerTable {
  connection!: DatabaseConnection;
  bia!: SignedInUser;
  caio!: SignedInUser;
  root!: SignedInUser;
  tavern!: Table;
  private app!: FastifyInstance;
  private baseUrl = '';
  private readonly clients: RealtimeClient[] = [];
  private readonly env: Env;

  constructor(readonly ownerUsername: string | null) {
    this.env = { ...readEnv(process.env), adminSeed: null, ownerUsername };
  }

  async seed(): Promise<void> {
    await truncateAllTables(this.connection.db);
    this.app = await buildApp({ env: this.env, db: this.connection.db });
    this.baseUrl = await this.app.listen({ port: 0, host: '127.0.0.1' });
    this.bia = await signUpAndLogin(this.app, this.connection.db, 'Bia');
    this.caio = await signUpAndLogin(this.app, this.connection.db, 'Caio');
    this.root = await signUpAndLogin(this.app, this.connection.db, 'Root');
    const promote = { role: 'admin' } as const;
    await this.connection.db.update(users).set(promote).where(eq(users.id, this.root.id));
    this.tavern = await createTable(this.app, this.bia, 'A Taverna de Bia');
    await joinByCode(this.app, this.caio, this.tavern);
  }

  async stop(): Promise<void> {
    for (const client of this.clients.splice(0)) client.close();
    await this.app.close();
  }

  createTableAs(user: SignedInUser): Promise<LightMyRequestResponse> {
    const payload = { name: 'A Segunda Torre' };
    const cookies = { lk_session: user.token };
    return this.app.inject({ method: 'POST', url: '/api/campaigns', payload, cookies });
  }

  async me(user: SignedInUser): Promise<AuthUserDto> {
    const me = meResponseDto.parse(await this.read(user, '/api/auth/me')).user;
    if (!me) throw new Error(`/me of ${user.id} answered no user`);
    return me;
  }

  async profile(user: SignedInUser): Promise<ProfileDto> {
    return profileResponseDto.parse(await this.read(user, '/api/account/profile')).profile;
  }

  async detail(user: SignedInUser, table: Table): Promise<CampaignDetailDto> {
    const body = await this.read(user, `/api/campaigns/${table.id}`);
    return campaignResponseDto.parse(body).campaign;
  }

  async directory(user: SignedInUser): Promise<AdminUserDto[]> {
    return adminDirectoryResponseDto.parse(await this.read(user, '/api/admin/users')).users;
  }

  async roster(user: SignedInUser, table: Table): Promise<SessionMemberDto[]> {
    const client = await connectRealtime(this.baseUrl, { token: user.token });
    this.clients.push(client);
    const command = { actionId: crypto.randomUUID(), campaignId: table.id };
    const ack = sessionJoinAckDto.parse(
      await client.timeout(2000).emitWithAck('session:join', command),
    );
    if (!ack.ok) throw new Error(`join of ${table.id} refused with ${ack.error.code}`);
    return ack.state.members;
  }

  private async read(user: SignedInUser, url: string): Promise<unknown> {
    const cookies = { lk_session: user.token };
    const response = await this.app.inject({ method: 'GET', url, cookies });
    expect(response.statusCode).toBe(200);
    return response.json();
  }
}

function useOwnerTable(ownerUsername: string | null): OwnerTable {
  const table = new OwnerTable(ownerUsername);
  beforeAll(async () => {
    table.connection = await openTestDatabase({ ownerUsername });
  });
  afterAll(() => table.connection.close());
  beforeEach(() => table.seed());
  afterEach(() => table.stop());
  return table;
}

describe('OWNER_USERNAME=bia: Bia is the Dono do Lorkarium', () => {
  const live = useOwnerTable('bia');

  it('her /me says Dono, with the limits of amigo_do_dono and customization on free', async () => {
    const me = await live.me(live.bia);

    expect(me).toMatchObject({ plan: 'free', lorkariumOwner: true, customization: true });
    expect(me.limits).toEqual(PLAN_LIMITS.amigo_do_dono);
  });

  it('on free she creates a second table: the Dono has no plan limit', async () => {
    expect((await live.createTableAs(live.bia)).statusCode).toBe(201);
  });

  it('her table has no plan limit, and its roster and detail mark her alone', async () => {
    const detail = await live.detail(live.caio, live.tavern);
    const roster = await live.roster(live.caio, live.tavern);

    expect(detail.limits).toEqual(PLAN_LIMITS.amigo_do_dono);
    const seals = [
      { userId: live.bia.id, plan: 'free', lorkariumOwner: true, admin: false },
      { userId: live.caio.id, plan: 'free', lorkariumOwner: false, admin: false },
    ];
    expect(detail.members).toMatchObject(seals);
    expect(roster).toMatchObject(seals);
  });

  it('her profile and the backoffice list mark her alone', async () => {
    const accounts = await live.directory(live.root);

    expect((await live.profile(live.bia)).lorkariumOwner).toBe(true);
    expect((await live.profile(live.caio)).lorkariumOwner).toBe(false);
    const marked = accounts.filter((account) => account.lorkariumOwner);
    expect(marked.map((account) => account.username)).toEqual(['bia']);
  });

  it('Caio, another @, keeps the free limits and a refused second table', async () => {
    const me = await live.me(live.caio);

    expect(me).toMatchObject({ lorkariumOwner: false, customization: false });
    expect(me.limits).toEqual(PLAN_LIMITS.free);
    await live.createTableAs(live.caio);
    expect((await live.createTableAs(live.caio)).statusCode).toBe(403);
  });
});

describe('OWNER_USERNAME empty: nobody is the Dono do Lorkarium', () => {
  const live = useOwnerTable(null);

  it('Bia on free keeps the free limits, and no member is marked', async () => {
    const me = await live.me(live.bia);
    const roster = await live.roster(live.caio, live.tavern);

    expect(me).toMatchObject({ lorkariumOwner: false });
    expect(me.limits).toEqual(PLAN_LIMITS.free);
    expect(roster.map((member) => member.lorkariumOwner)).toEqual([false, false]);
  });

  it('a second table of Bia on free is refused by the plan', async () => {
    expect((await live.createTableAs(live.bia)).statusCode).toBe(403);
  });
});
