import { apiErrorDto, profileResponseDto, type PlanFeatureResource } from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { S3AssetStorage } from '../../src/infrastructure/asset-storage/s3-asset-storage';
import { users } from '../../src/modules/auth/users.po';
import { setAccountPlan } from '../support/account-plans';
import { animatedGifOf, pngOf } from '../support/images';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

type Request = Readonly<{
  method: 'GET' | 'PATCH' | 'PUT' | 'POST' | 'DELETE';
  url: string;
  payload?: object | Buffer;
  contentType?: string;
}>;

describe('the customizations of the account follow the plan of the person', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const storage = new S3AssetStorage(env.storage);
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let bia: SignedInUser;
  let caio: SignedInUser;
  let texture: Buffer;
  let gif: Buffer;

  beforeAll(async () => {
    connection = await openTestDatabase();
    texture = await pngOf(600, 600);
    gif = await animatedGifOf(3, 64);
  });

  afterAll(async () => {
    storage.destroy();
    await connection.close();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    bia = await signUpAndLogin(app, connection.db, 'Bia');
    caio = await signUpAndLogin(app, connection.db, 'Caio');
    await setAccountPlan(connection.db, caio.id, 'amigo_do_dono');
  });

  afterEach(() => app.close());

  function call(user: SignedInUser, request: Request): Promise<LightMyRequestResponse> {
    const headers = request.contentType ? { 'content-type': request.contentType } : {};
    const { method, payload } = request;
    const cookies = { lk_session: user.token };
    return app.inject({ method, url: `/api${request.url}`, cookies, headers, payload });
  }

  function patch(user: SignedInUser, payload: object): Promise<LightMyRequestResponse> {
    return call(user, { method: 'PATCH', url: '/account/profile', payload });
  }

  function send(user: SignedInUser, url: string, bytes: Buffer, contentType: string) {
    return call(user, { method: 'PUT', url, payload: bytes, contentType });
  }

  function expectRefused(response: LightMyRequestResponse, resource: PlanFeatureResource): void {
    expect(response.statusCode).toBe(403);
    expect(apiErrorDto.parse(response.json())).toMatchObject({
      code: 'PLAN_LIMIT',
      planLimit: { resource, limit: 0, plan: 'free' },
    });
  }

  async function framesOfPhoto(response: LightMyRequestResponse): Promise<number> {
    const { avatarId } = profileResponseDto.parse(response.json()).profile;
    const served = await call(bia, { method: 'GET', url: `/avatars/${avatarId}` });
    return (await sharp(served.rawPayload, { animated: true }).metadata()).pages ?? 1;
  }

  it('Bia on free is 403 customColor for a hex color, and a palette one passes', async () => {
    expectRefused(await patch(bia, { color: '#336699' }), 'customColor');

    const palette = await patch(bia, { color: 'moss' });
    expect(profileResponseDto.parse(palette.json()).profile.colorChoice).toBe('moss');
  });

  it('Bia on free is 403 customColor for a dice number color', async () => {
    expectRefused(await patch(bia, { diceNumberColor: '#ffffff' }), 'customColor');
  });

  it('Bia on free is 403 diceTexture sending a texture, by file or by link', async () => {
    expectRefused(await send(bia, '/account/dice-texture', texture, 'image/png'), 'diceTexture');
    const link = { method: 'POST', url: '/account/dice-texture/link' } as const;
    const byLink = await call(bia, { ...link, payload: { url: 'https://example.com/t.png' } });
    expectRefused(byLink, 'diceTexture');
  });

  it('Bia on free still takes the dice texture off', async () => {
    const response = await call(bia, { method: 'DELETE', url: '/account/dice-texture' });

    expect(response.statusCode).toBe(200);
  });

  it('Bia on free is 403 customColor saving a color', async () => {
    const payload = { color: '#336699' };
    const response = await call(bia, { method: 'POST', url: '/account/saved-colors', payload });

    expectRefused(response, 'customColor');
  });

  it('a GIF photo of Bia on free is kept still; on Apoiador it moves', async () => {
    const still = await send(bia, '/account/avatar', gif, 'image/gif');
    expect(await framesOfPhoto(still)).toBe(1);

    await connection.db.update(users).set({ plan: 'apoiador' }).where(eq(users.id, bia.id));
    const moving = await send(bia, '/account/avatar', gif, 'image/gif');
    expect(await framesOfPhoto(moving)).toBe(3);
  });

  it('the hex color Bia already had stays on her profile (who is past keeps it)', async () => {
    await connection.db.update(users).set({ color: '#336699' }).where(eq(users.id, bia.id));

    const response = await call(bia, { method: 'GET', url: '/account/profile' });

    expect(profileResponseDto.parse(response.json()).profile.colorChoice).toBe('#336699');
  });

  it('Caio on amigo_do_dono does everything as today', async () => {
    const colors = { color: '#336699', diceNumberColor: '#ffffff' };
    expect((await patch(caio, colors)).statusCode).toBe(200);
    const sent = await send(caio, '/account/dice-texture', texture, 'image/png');
    expect(sent.statusCode).toBe(200);
    const payload = { color: '#336699' };
    const saved = await call(caio, { method: 'POST', url: '/account/saved-colors', payload });
    expect(saved.statusCode).toBe(200);
  });
});
