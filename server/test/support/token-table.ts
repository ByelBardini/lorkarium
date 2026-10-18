import { tokenCreatedDto, type TokenDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import type { AssetDto } from '@lorkarium/contracts';
import { sendImage } from './images';
import { atTable, envelope, eventPayload } from './live-table';
import type { EventRecorder, RealtimeClient } from './realtime-client';
import { signUpAndLogin, type SignedInUser } from './sign-in';
import { createTable, joinByCode, type Table } from './tables';
import { openTestDatabase, truncateAllTables } from './test-database';

/** Ana masters Vharn with Bia and Caio as players; Caio masters Quelm alone. Fields are set by
 *  the hooks `useTokenTable` registers, so read them inside an `it`. */
export class TokenTableHarness {
  ana!: SignedInUser;
  bia!: SignedInUser;
  caio!: SignedInUser;
  vharn!: Table;
  quelm!: Table;
  connection!: DatabaseConnection;
  private app!: FastifyInstance;
  private baseUrl = '';
  private readonly clients: RealtimeClient[] = [];
  private readonly env: Env = { ...readEnv(process.env), adminSeed: null };

  async start(): Promise<void> {
    this.app = await buildApp({ env: this.env, db: this.connection.db });
    this.baseUrl = await this.app.listen({ port: 0, host: '127.0.0.1' });
  }

  async stop(): Promise<void> {
    for (const client of this.clients.splice(0)) client.close();
    await this.app.close();
  }

  /** Closes every client and the app, then starts a new app on the same database. */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async seed(): Promise<void> {
    await truncateAllTables(this.connection.db);
    await this.start();
    this.ana = await signUpAndLogin(this.app, this.connection.db, 'Ana');
    this.bia = await signUpAndLogin(this.app, this.connection.db, 'Bia');
    this.caio = await signUpAndLogin(this.app, this.connection.db, 'Caio');
    this.vharn = await createTable(this.app, this.ana, 'Os Sinos de Vharn');
    this.quelm = await createTable(this.app, this.caio, 'Quelm');
    await joinByCode(this.app, this.bia, this.vharn);
    await joinByCode(this.app, this.caio, this.vharn);
  }

  atTable(user: SignedInUser, table: Table): Promise<RealtimeClient> {
    return atTable(this.baseUrl, this.clients, user, table);
  }

  /** A 400×400 PNG sent to `table` by `user` through the real HTTP edge. */
  sendImage(user: SignedInUser, table: Table): Promise<AssetDto> {
    return sendImage(this.app, user, table, 400, 400);
  }
}

/** Registers the hooks of a three-client table spec and hands back the harness.
 *
 *  Example: `const live = useTokenTable(); it('…', async () => live.atTable(live.ana, live.vharn))` */
export function useTokenTable(): TokenTableHarness {
  const harness = new TokenTableHarness();
  beforeAll(async () => {
    harness.connection = await openTestDatabase();
  });
  afterAll(() => harness.connection.close());
  beforeEach(() => harness.seed());
  afterEach(() => harness.stop());
  return harness;
}

/** A `token:create` payload for a 1-cell ally at (3, 4) controlled by `controllerId`.
 *
 *  Example: `await send(master, 'token:create', tokenCommandFor(vharn, bia.id, { layer: 'objects' }))` */
export function tokenCommandFor(
  table: Table,
  controllerId: string,
  overrides: Record<string, unknown> = {},
): object {
  return {
    ...envelope(table.id),
    name: 'Lyra',
    initials: 'LY',
    side: 'ally',
    width: 1,
    height: 1,
    col: 3,
    row: 4,
    controllerIds: [controllerId],
    bars: [
      { label: 'PV', current: 32, max: 45, color: 'ember', visibility: 'controllers' },
      { label: 'Inspiração', current: 1, max: 1, color: 'gold', visibility: 'everyone' },
    ],
    ...overrides,
  };
}

/** The token of the first `token:created` the recorder got. */
export async function createdTokenOf(recorder: EventRecorder): Promise<TokenDto> {
  return tokenCreatedDto.parse(await eventPayload(recorder, 'token:created')).token;
}
