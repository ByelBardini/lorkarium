import {
  adminBadgeResponseDto,
  adminBadgesResponseDto,
  userBadgeIdsResponseDto,
  userBadgesResponseDto,
  type AdminBadgeDto,
} from '@lorkarium/contracts';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { S3AssetStorage } from '../../src/infrastructure/asset-storage/s3-asset-storage';
import { users } from '../../src/modules/auth/users.po';
import { pngOf } from '../support/images';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const MIB = 1024 * 1024;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const CROP = 'cropX=0&cropY=0&cropW=50&cropH=100';

type Request = Readonly<{
  method: 'GET' | 'PATCH' | 'PUT' | 'POST' | 'DELETE';
  url: string;
  payload?: object | Buffer | string;
  contentType?: string;
}>;

describe('badges HTTP edge', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const storage = new S3AssetStorage(env.storage);
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let root: SignedInUser;
  let bia: SignedInUser;
  let png: Buffer;

  beforeAll(async () => {
    connection = await openTestDatabase();
    png = await pngOf(400, 200);
  });

  afterAll(async () => {
    storage.destroy();
    await connection.close();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    root = await signUpAndLogin(app, connection.db, 'Root');
    bia = await signUpAndLogin(app, connection.db, 'Bia');
    await connection.db.update(users).set({ role: 'admin' }).where(eq(users.id, root.id));
  });

  afterEach(() => app.close());

  function call(user: SignedInUser | null, request: Request): Promise<LightMyRequestResponse> {
    const cookies: Record<string, string> = user ? { lk_session: user.token } : {};
    const headers = request.contentType ? { 'content-type': request.contentType } : {};
    const { method, payload } = request;
    return app.inject({ method, url: `/api${request.url}`, cookies, headers, payload });
  }

  function codeOf(response: LightMyRequestResponse): [number, unknown] {
    return [response.statusCode, response.json().code];
  }

  async function create(name: string, description = `${name}!`): Promise<AdminBadgeDto> {
    const response = await call(root, {
      method: 'POST',
      url: '/admin/badges',
      payload: { name, description },
    });
    expect(response.statusCode).toBe(201);
    return adminBadgeResponseDto.parse(response.json()).badge;
  }

  function sendImage(
    user: SignedInUser | null,
    badgeId: string,
    bytes: Buffer | string = png,
    contentType = 'image/png',
  ): Promise<LightMyRequestResponse> {
    const url = `/admin/badges/${badgeId}/image?${CROP}`;
    return call(user, { method: 'PUT', url, payload: bytes, contentType });
  }

  async function withImage(name: string): Promise<AdminBadgeDto> {
    const { id } = await create(name);
    return adminBadgeResponseDto.parse((await sendImage(root, id)).json()).badge;
  }

  function grant(user: SignedInUser | null, userId: string, badgeIds: string[]) {
    const url = `/admin/users/${userId}/badges`;
    return call(user, { method: 'PUT', url, payload: { badgeIds } });
  }

  async function catalog(): Promise<AdminBadgeDto[]> {
    const response = await call(root, { method: 'GET', url: '/admin/badges' });
    return adminBadgesResponseDto.parse(response.json()).badges;
  }

  describe('the catalog', () => {
    it('creating puts the badge last, with no image and nobody holding it', async () => {
      await create('Veterano');

      const created = await create(' Mestre ', 'Mestrou 10 mesas');

      expect(created).toMatchObject({ name: 'Mestre', imageId: null, position: 1, holders: 0 });
      expect((await catalog()).map((badge) => badge.name)).toEqual(['Veterano', 'Mestre']);
    });

    it('a name taken in another case is 409 BADGE_NAME_TAKEN, on create and on edit', async () => {
      await create('veterano');
      const mestre = await create('Mestre');

      const payload = { name: 'Veterano', description: 'x' };
      const created = await call(root, { method: 'POST', url: '/admin/badges', payload });
      const url = `/admin/badges/${mestre.id}`;
      const edited = await call(root, { method: 'PATCH', url, payload: { name: 'VETERANO' } });

      expect(codeOf(created)).toEqual([409, 'BADGE_NAME_TAKEN']);
      expect(codeOf(edited)).toEqual([409, 'BADGE_NAME_TAKEN']);
    });

    it('editing changes only the text sent', async () => {
      const { id } = await create('Veterano', 'Jogou 100 sessões');

      const url = `/admin/badges/${id}`;
      const response = await call(root, { method: 'PATCH', url, payload: { name: 'Lenda' } });

      const { badge } = adminBadgeResponseDto.parse(response.json());
      expect([badge.name, badge.description]).toEqual(['Lenda', 'Jogou 100 sessões']);
    });

    it('a body with an extra key, an empty edit or a malformed id is 400', async () => {
      const { id } = await create('Veterano');
      const extra = { name: 'X', description: 'y', position: 0 };

      const responses = await Promise.all([
        call(root, { method: 'POST', url: '/admin/badges', payload: extra }),
        call(root, { method: 'PATCH', url: `/admin/badges/${id}`, payload: {} }),
        call(root, { method: 'PATCH', url: '/admin/badges/nope', payload: { name: 'X' } }),
      ]);

      expect(responses.map((response) => response.statusCode)).toEqual([400, 400, 400]);
    });

    it('editing or deleting an unknown badge is 404 BADGE_NOT_FOUND', async () => {
      const url = `/admin/badges/${UNKNOWN_ID}`;

      const edited = await call(root, { method: 'PATCH', url, payload: { name: 'X' } });
      const deleted = await call(root, { method: 'DELETE', url });

      expect(codeOf(edited)).toEqual([404, 'BADGE_NOT_FOUND']);
      expect(codeOf(deleted)).toEqual([404, 'BADGE_NOT_FOUND']);
    });
  });

  describe('the image', () => {
    it('a PNG with the rectangle becomes a 128 WebP that any session reads', async () => {
      const { id } = await create('Veterano');

      const sent = await sendImage(root, id);
      const { imageId } = adminBadgeResponseDto.parse(sent.json()).badge;
      const read = await call(bia, { method: 'GET', url: `/badge-images/${imageId}` });

      expect(read.statusCode).toBe(200);
      expect(read.headers['content-type']).toBe('image/webp');
      expect(read.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      const metadata = await sharp(read.rawPayload).metadata();
      expect([metadata.format, metadata.width, metadata.height]).toEqual(['webp', 128, 128]);
    });

    it('a new image gets a new id; the old one is 404 and leaves the bucket', async () => {
      const first = await withImage('Veterano');

      const second = adminBadgeResponseDto.parse((await sendImage(root, first.id)).json()).badge;
      const old = await call(bia, { method: 'GET', url: `/badge-images/${first.imageId}` });

      expect(second.imageId).not.toBe(first.imageId);
      expect(codeOf(old)).toEqual([404, 'BADGE_IMAGE_NOT_FOUND']);
      expect(await storage.open(`badges/${first.imageId}`)).toBeNull();
    });

    it('above 2 MiB is 413, a text body 415, bytes that are no image 422', async () => {
      const { id } = await create('Veterano');

      const big = await sendImage(root, id, Buffer.alloc(2 * MIB + 1));
      const text = await sendImage(root, id, 'hello', 'text/plain');
      const junk = await sendImage(root, id, Buffer.from('not an image'));

      expect(codeOf(big)).toEqual([413, 'BADGE_IMAGE_TOO_LARGE']);
      expect(codeOf(text)).toEqual([415, 'UNSUPPORTED_IMAGE']);
      expect(codeOf(junk)).toEqual([422, 'UNSUPPORTED_IMAGE']);
    });

    it('without a session the send is refused before the body is read', async () => {
      const { id } = await create('Veterano');

      const response = await sendImage(null, id, Buffer.alloc(2 * MIB + 1));

      expect(codeOf(response)).toEqual([401, 'UNAUTHENTICATED']);
    });

    it('a player sending is 403 even with a body too large', async () => {
      const { id } = await create('Veterano');

      const response = await sendImage(bia, id, Buffer.alloc(2 * MIB + 1));

      expect(codeOf(response)).toEqual([403, 'FORBIDDEN_ROLE']);
    });

    it('an image of an unknown badge is 404; an unknown or malformed image id is 404', async () => {
      const sent = await sendImage(root, UNKNOWN_ID);
      const unknown = await call(bia, { method: 'GET', url: `/badge-images/${UNKNOWN_ID}` });
      const malformed = await call(bia, { method: 'GET', url: '/badge-images/nope' });

      expect(codeOf(sent)).toEqual([404, 'BADGE_NOT_FOUND']);
      expect(codeOf(unknown)).toEqual([404, 'BADGE_IMAGE_NOT_FOUND']);
      expect(codeOf(malformed)).toEqual([404, 'BADGE_IMAGE_NOT_FOUND']);
    });

    it('reading an image without a session is 401', async () => {
      const { imageId } = await withImage('Veterano');

      expect(
        (await call(null, { method: 'GET', url: `/badge-images/${imageId}` })).statusCode,
      ).toBe(401);
    });
  });

  describe('the order', () => {
    it('the catalog in another order is saved; the current order again answers the same', async () => {
      const a = await create('A');
      const b = await create('B');
      const c = await create('C');
      const order = (badgeIds: string[]) =>
        call(root, { method: 'PUT', url: '/admin/badges/order', payload: { badgeIds } });

      const moved = await order([c.id, a.id, b.id]);
      const again = await order([c.id, a.id, b.id]);

      const names = (response: LightMyRequestResponse) =>
        adminBadgesResponseDto.parse(response.json()).badges.map((badge) => badge.name);
      expect(names(moved)).toEqual(['C', 'A', 'B']);
      expect(again.json()).toEqual(moved.json());
    });

    it('an order missing a badge is 409 BADGE_ORDER_STALE and nothing moves', async () => {
      const a = await create('A');
      await create('B');

      const payload = { badgeIds: [a.id] };
      const response = await call(root, { method: 'PUT', url: '/admin/badges/order', payload });

      expect(codeOf(response)).toEqual([409, 'BADGE_ORDER_STALE']);
      expect((await catalog()).map((badge) => badge.name)).toEqual(['A', 'B']);
    });
  });

  describe('the grants', () => {
    it('granting answers the badges of the account in catalog order, and the ids read back', async () => {
      const veterano = await withImage('Veterano');
      const mestre = await withImage('Mestre');

      const response = await grant(root, bia.id, [mestre.id, veterano.id]);
      const read = await call(root, { method: 'GET', url: `/admin/users/${bia.id}/badges` });

      const { badges } = userBadgesResponseDto.parse(response.json());
      expect(badges.map((badge) => badge.name)).toEqual(['Veterano', 'Mestre']);
      expect(userBadgeIdsResponseDto.parse(read.json()).badgeIds).toEqual([veterano.id, mestre.id]);
      expect((await catalog()).map((badge) => badge.holders)).toEqual([1, 1]);
    });

    it('granting [] takes every badge off', async () => {
      const veterano = await withImage('Veterano');
      await grant(root, bia.id, [veterano.id]);

      const response = await grant(root, bia.id, []);

      expect(userBadgesResponseDto.parse(response.json()).badges).toEqual([]);
    });

    it('a badge without an image is 409 BADGE_WITHOUT_IMAGE, an unknown one 404', async () => {
      const without = await create('Sem imagem');

      expect(codeOf(await grant(root, bia.id, [without.id]))).toEqual([409, 'BADGE_WITHOUT_IMAGE']);
      expect(codeOf(await grant(root, bia.id, [UNKNOWN_ID]))).toEqual([404, 'BADGE_NOT_FOUND']);
    });

    it('an unknown account is 404 USER_NOT_FOUND on both routes', async () => {
      const read = await call(root, { method: 'GET', url: `/admin/users/${UNKNOWN_ID}/badges` });

      expect(codeOf(await grant(root, UNKNOWN_ID, []))).toEqual([404, 'USER_NOT_FOUND']);
      expect(codeOf(read)).toEqual([404, 'USER_NOT_FOUND']);
    });

    it('a repeated id in the grant is 400', async () => {
      const veterano = await withImage('Veterano');

      expect((await grant(root, bia.id, [veterano.id, veterano.id])).statusCode).toBe(400);
    });

    it('deleting is 204: the badge leaves the account and its image leaves the bucket', async () => {
      const veterano = await withImage('Veterano');
      await grant(root, bia.id, [veterano.id]);

      const deleted = await call(root, { method: 'DELETE', url: `/admin/badges/${veterano.id}` });
      const read = await call(root, { method: 'GET', url: `/admin/users/${bia.id}/badges` });

      expect(deleted.statusCode).toBe(204);
      expect(userBadgeIdsResponseDto.parse(read.json()).badgeIds).toEqual([]);
      expect(await storage.open(`badges/${veterano.imageId}`)).toBeNull();
    });
  });

  describe('who may call', () => {
    const adminRoutes: Request[] = [
      { method: 'GET', url: '/admin/badges' },
      { method: 'POST', url: '/admin/badges', payload: { name: 'X', description: 'y' } },
      { method: 'PATCH', url: `/admin/badges/${UNKNOWN_ID}`, payload: { name: 'X' } },
      { method: 'PUT', url: '/admin/badges/order', payload: { badgeIds: [] } },
      { method: 'DELETE', url: `/admin/badges/${UNKNOWN_ID}` },
      { method: 'GET', url: `/admin/users/${UNKNOWN_ID}/badges` },
      { method: 'PUT', url: `/admin/users/${UNKNOWN_ID}/badges`, payload: { badgeIds: [] } },
    ];

    it('without a session every admin route is 401, and for a player 403', async () => {
      for (const request of adminRoutes) {
        expect(codeOf(await call(null, request))).toEqual([401, 'UNAUTHENTICATED']);
        expect(codeOf(await call(bia, request))).toEqual([403, 'FORBIDDEN_ROLE']);
      }
    });
  });
});
