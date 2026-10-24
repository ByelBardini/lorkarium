import {
  apiErrorDto,
  meResponseDto,
  profileResponseDto,
  type ProfileDto,
} from '@lorkarium/contracts';
import { memberColorOf } from '@lorkarium/game-core';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app/build-app';
import { readEnv, type Env } from '../../src/config/env';
import type { DatabaseConnection } from '../../src/database/database';
import { S3AssetStorage } from '../../src/infrastructure/asset-storage/s3-asset-storage';
import { pngOf } from '../support/images';
import { signUpAndLogin, type SignedInUser } from '../support/sign-in';
import { openTestDatabase, truncateAllTables } from '../support/test-database';

const MIB = 1024 * 1024;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

type Request = Readonly<{
  method: 'GET' | 'PATCH' | 'PUT' | 'POST' | 'DELETE';
  url: string;
  payload?: object | Buffer | string;
  contentType?: string;
}>;

describe('profiles HTTP edge', () => {
  const env: Env = { ...readEnv(process.env), adminSeed: null };
  const storage = new S3AssetStorage(env.storage);
  let connection: DatabaseConnection;
  let app: FastifyInstance;
  let ana: SignedInUser;
  let bia: SignedInUser;
  let photo: Buffer;

  beforeAll(async () => {
    connection = await openTestDatabase();
    photo = await pngOf(800, 400);
  });

  afterAll(async () => {
    storage.destroy();
    await connection.close();
  });

  beforeEach(async () => {
    await truncateAllTables(connection.db);
    app = await buildApp({ env, db: connection.db });
    ana = await signUpAndLogin(app, connection.db, 'Ana');
    bia = await signUpAndLogin(app, connection.db, 'Bia');
  });

  afterEach(() => app.close());

  function call(user: SignedInUser | undefined, request: Request): Promise<LightMyRequestResponse> {
    const cookies: Record<string, string> = user ? { lk_session: user.token } : {};
    const headers = request.contentType ? { 'content-type': request.contentType } : {};
    const { method, payload } = request;
    return app.inject({ method, url: `/api${request.url}`, cookies, headers, payload });
  }

  async function profileOf(user: SignedInUser): Promise<ProfileDto> {
    const response = await call(user, { method: 'GET', url: '/account/profile' });
    return profileResponseDto.parse(response.json()).profile;
  }

  function patch(user: SignedInUser | undefined, payload: object): Promise<LightMyRequestResponse> {
    return call(user, { method: 'PATCH', url: '/account/profile', payload });
  }

  function sendPhoto(
    user: SignedInUser | undefined,
    bytes: Buffer | string,
    contentType = 'image/png',
  ): Promise<LightMyRequestResponse> {
    return call(user, { method: 'PUT', url: '/account/avatar', payload: bytes, contentType });
  }

  async function sentPhotoId(user: SignedInUser): Promise<string> {
    const avatarId = profileResponseDto.parse((await sendPhoto(user, photo)).json()).profile
      .avatarId;
    if (avatarId === null) throw new Error('the photo send answered no avatarId');
    return avatarId;
  }

  function codeOf(response: LightMyRequestResponse): string {
    return apiErrorDto.parse(response.json()).code;
  }

  describe('reading and editing', () => {
    it('the profile of Ana has her @, nickname, the drawn color with no choice and no photo', async () => {
      expect(await profileOf(ana)).toMatchObject({
        id: ana.id,
        username: 'ana',
        name: 'Ana',
        color: memberColorOf(ana.id, null),
        colorChoice: null,
        bio: null,
        avatarId: null,
      });
    });

    it('Ana changing her nickname, color and bio leaves Bia as she was', async () => {
      const response = await patch(ana, { name: '  Aninha ', color: 'rose', bio: 'Mestre' });

      expect(response.statusCode).toBe(200);
      expect(profileResponseDto.parse(response.json()).profile).toMatchObject({
        name: 'Aninha',
        color: 'rose',
        colorChoice: 'rose',
        bio: 'Mestre',
      });
      expect(await profileOf(bia)).toMatchObject({ name: 'Bia', colorChoice: null });
    });

    it('a null color goes back to the drawn one', async () => {
      await patch(ana, { color: 'rose' });

      await patch(ana, { color: null });

      expect(await profileOf(ana)).toMatchObject({
        color: memberColorOf(ana.id, null),
        colorChoice: null,
      });
    });

    it('the /me that follows already carries the new nickname', async () => {
      await patch(ana, { name: 'Aninha' });

      const response = await call(ana, { method: 'GET', url: '/auth/me' });

      expect(meResponseDto.parse(response.json()).user?.name).toBe('Aninha');
    });

    it.each([
      [{ username: 'outra' }],
      [{ name: 'Ana', username: 'outra' }],
      [{}],
      [{ name: '   ' }],
      [{ color: 'purple' }],
    ])('the body %j answers 400 INVALID_BODY and changes nothing', async (body) => {
      const response = await patch(ana, body);

      expect(response.statusCode).toBe(400);
      expect(codeOf(response)).toBe('INVALID_BODY');
      expect(await profileOf(ana)).toMatchObject({ username: 'ana', name: 'Ana' });
    });

    it.each([
      ['GET', '/account/profile'],
      ['PATCH', '/account/profile'],
      ['PUT', '/account/avatar'],
      ['DELETE', '/account/avatar'],
      ['GET', `/avatars/${UNKNOWN_ID}`],
    ] as const)('%s %s without a session answers 401 UNAUTHENTICATED', async (method, url) => {
      const payload = method === 'PATCH' ? { name: 'X' } : undefined;
      const contentType = method === 'PUT' ? 'image/png' : undefined;

      const response = await call(undefined, { method, url, payload, contentType });

      expect(response.statusCode).toBe(401);
      expect(codeOf(response)).toBe('UNAUTHENTICATED');
    });

    it('the 31st profile save in a minute answers 429 RATE_LIMITED with Retry-After', async () => {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        expect((await patch(ana, { bio: `vez ${attempt}` })).statusCode).toBe(200);
      }

      const response = await patch(ana, { bio: 'de novo' });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
      expect(apiErrorDto.parse(response.json())).toMatchObject({ code: 'RATE_LIMITED' });
      expect((await patch(bia, { bio: 'a minha' })).statusCode).toBe(200);
    });
  });

  describe('the photo', () => {
    it('a PNG becomes a 256×256 WebP served with a year of private cache and nosniff', async () => {
      const avatarId = await sentPhotoId(ana);

      const response = await call(ana, { method: 'GET', url: `/avatars/${avatarId}` });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      const metadata = await sharp(response.rawPayload).metadata();
      expect([metadata.format, metadata.width, metadata.height]).toEqual(['webp', 256, 256]);
    });

    it('anyone signed in reads the photo by its id, sharing a table or not', async () => {
      const avatarId = await sentPhotoId(ana);

      const response = await call(bia, { method: 'GET', url: `/avatars/${avatarId}` });

      expect(response.statusCode).toBe(200);
    });

    it('a second photo makes the old id answer 404 and removes its object from the bucket', async () => {
      const oldId = await sentPhotoId(ana);

      const newId = await sentPhotoId(ana);

      expect(newId).not.toBe(oldId);
      const old = await call(ana, { method: 'GET', url: `/avatars/${oldId}` });
      expect(old.statusCode).toBe(404);
      expect(codeOf(old)).toBe('AVATAR_NOT_FOUND');
      expect(await storage.open(`avatars/${oldId}`)).toBeNull();
    });

    it('taking the photo off answers the profile without it, 404 on the id, and again is fine', async () => {
      const avatarId = await sentPhotoId(ana);

      const removed = await call(ana, { method: 'DELETE', url: '/account/avatar' });

      expect(profileResponseDto.parse(removed.json()).profile.avatarId).toBeNull();
      expect((await call(ana, { method: 'GET', url: `/avatars/${avatarId}` })).statusCode).toBe(
        404,
      );
      expect(await storage.open(`avatars/${avatarId}`)).toBeNull();
      expect((await call(ana, { method: 'DELETE', url: '/account/avatar' })).statusCode).toBe(200);
    });

    it('a malformed or unknown id answers 404 AVATAR_NOT_FOUND', async () => {
      for (const id of ['not-a-uuid', UNKNOWN_ID]) {
        const response = await call(ana, { method: 'GET', url: `/avatars/${id}` });
        expect(response.statusCode).toBe(404);
        expect(codeOf(response)).toBe('AVATAR_NOT_FOUND');
      }
    });

    it('a body of 5 MiB + 1 answers 413 AVATAR_TOO_LARGE', async () => {
      const response = await sendPhoto(ana, Buffer.alloc(5 * MIB + 1));

      expect(response.statusCode).toBe(413);
      expect(codeOf(response)).toBe('AVATAR_TOO_LARGE');
    });

    it('text sent as a PNG answers 422 UNSUPPORTED_IMAGE and keeps no photo', async () => {
      const response = await sendPhoto(ana, 'isto não é imagem');

      expect(response.statusCode).toBe(422);
      expect(codeOf(response)).toBe('UNSUPPORTED_IMAGE');
      expect((await profileOf(ana)).avatarId).toBeNull();
    });

    it.each(['text/plain', 'application/json', 'image/svg+xml'])(
      'a body of type %s answers 415 UNSUPPORTED_IMAGE',
      async (contentType) => {
        const response = await sendPhoto(ana, '{"x":1}', contentType);

        expect(response.statusCode).toBe(415);
        expect(codeOf(response)).toBe('UNSUPPORTED_IMAGE');
      },
    );

    it('the 11th photo send in a minute answers 429 RATE_LIMITED', async () => {
      const tiny = await pngOf(8, 8);
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect((await sendPhoto(ana, tiny)).statusCode).toBe(200);
      }

      const response = await sendPhoto(ana, tiny);

      expect(response.statusCode).toBe(429);
      expect(codeOf(response)).toBe('RATE_LIMITED');
    });
  });

  describe('the photo from a link', () => {
    function linkPhoto(
      user: SignedInUser | undefined,
      url: string,
    ): Promise<LightMyRequestResponse> {
      return call(user, { method: 'POST', url: '/account/avatar/link', payload: { url } });
    }

    it('a link to an internal address answers 422 LINK_BLOCKED and the photo stays', async () => {
      const response = await linkPhoto(ana, 'http://127.0.0.1/a.gif');

      expect(response.statusCode).toBe(422);
      expect(codeOf(response)).toBe('LINK_BLOCKED');
      expect((await profileOf(ana)).avatarId).toBeNull();
    });

    it('a link that is not http(s) answers 400 INVALID_BODY', async () => {
      const response = await linkPhoto(ana, 'ftp://example.com/a.gif');

      expect(response.statusCode).toBe(400);
      expect(codeOf(response)).toBe('INVALID_BODY');
    });

    it('without a session it answers 401', async () => {
      expect((await linkPhoto(undefined, 'https://example.com/a.gif')).statusCode).toBe(401);
    });
  });
});
