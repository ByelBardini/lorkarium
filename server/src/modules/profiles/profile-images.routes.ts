import {
  AVATAR_MAX_BYTES,
  avatarLinkRequestDto,
  avatarParamsDto,
  diceTextureLinkRequestDto,
  diceTextureParamsDto,
  type ProfileDto,
  type ProfileResponseDto,
} from '@lorkarium/contracts';
import type { FastifyInstance, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import type { z } from 'zod';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import type { StoredObject } from '../assets/asset-storage.port';
import {
  AvatarMediaTypeError,
  AvatarNotFoundError,
  AvatarTooLargeError,
  DiceTextureNotFoundError,
  DiceTextureTooLargeError,
  type ProfileError,
} from './profiles.error';
import { AVATAR_CONTENT_TYPE } from './profiles.mapper';
import type { ProfilesService } from './profiles.service';

// Each send decodes an image (a photo maybe 120 frames): the costly routes get the tighter limit,
// one counter per route (a texture send does not spend the photo's).
const IMAGE_SENDS_PER_MINUTE = 10;
// An image id never changes content (a new send is a new id), so the browser may keep it a year.
const IMAGE_CACHE_CONTROL = 'private, max-age=31536000, immutable';

/** The HTTP edge of one image of the account: where it is sent and read, and what it calls. */
export type ProfileImageEdge = Readonly<{
  sendUrl: string;
  readUrl: string;
  linkBody: z.ZodType<{ url: string }>;
  imageIdOf: (request: FastifyRequest) => string;
  tooLarge: () => ProfileError;
  replace: (userId: string, bytes: Uint8Array) => Promise<ProfileDto>;
  replaceFromLink: (userId: string, url: string) => Promise<ProfileDto>;
  remove: (userId: string) => Promise<ProfileDto>;
  open: (imageId: string) => Promise<StoredObject>;
}>;

/** The photo and the dice texture, in that order: the same four routes over each.
 *
 *  Example: `for (const edge of profileImageEdgesOf(service)) registerImageRoutes(app, edge)` */
export function profileImageEdgesOf(service: ProfilesService): readonly ProfileImageEdge[] {
  return [avatarEdgeOf(service), diceTextureEdgeOf(service)];
}

function avatarEdgeOf(service: ProfilesService): ProfileImageEdge {
  return {
    sendUrl: '/account/avatar',
    readUrl: '/avatars/:avatarId',
    linkBody: avatarLinkRequestDto,
    imageIdOf: (request) => idParamOf(request, avatarParamsDto, (p) => p.avatarId, notFoundAvatar),
    tooLarge: () => new AvatarTooLargeError(AVATAR_MAX_BYTES, null),
    replace: (userId, bytes) => service.replaceAvatar(userId, bytes),
    replaceFromLink: (userId, url) => service.replaceAvatarFromLink(userId, url),
    remove: (userId) => service.removeAvatar(userId),
    open: (imageId) => service.openAvatar(imageId),
  };
}

function diceTextureEdgeOf(service: ProfilesService): ProfileImageEdge {
  return {
    sendUrl: '/account/dice-texture',
    readUrl: '/dice-textures/:diceTextureId',
    linkBody: diceTextureLinkRequestDto,
    imageIdOf: (request) =>
      idParamOf(request, diceTextureParamsDto, (p) => p.diceTextureId, notFoundTexture),
    tooLarge: () => new DiceTextureTooLargeError(AVATAR_MAX_BYTES, null),
    replace: (userId, bytes) => service.replaceDiceTexture(userId, bytes),
    replaceFromLink: (userId, url) => service.replaceDiceTextureFromLink(userId, url),
    remove: (userId) => service.removeDiceTexture(userId),
    open: (imageId) => service.openDiceTexture(imageId),
  };
}

/** Sending (file or link), taking off and reading one image. The account is the session's.
 *
 *  Example: `registerImageRoutes(app, profileImageEdgesOf(service)[1])` */
export function registerImageRoutes(app: FastifyInstance, edge: ProfileImageEdge): void {
  registerImageSend(app, edge);
  registerImageLink(app, edge);
  const { requireAuth, userOf } = app.authGuards;
  app.delete(edge.sendUrl, { preHandler: requireAuth }, async (request) => {
    return { profile: await edge.remove(userOf(request).id) } satisfies ProfileResponseDto;
  });
  registerImageRead(app, edge);
}

function registerImageSend(app: FastifyInstance, edge: ProfileImageEdge): void {
  const { requireAuth, userOf } = app.authGuards;
  // onRequest: who is not signed in is refused before a 5 MiB body is read; the limit runs on
  // preParsing, after the guard (the key is the user) and before the body.
  const options = {
    onRequest: requireAuth as onRequestAsyncHookHandler,
    bodyLimit: AVATAR_MAX_BYTES,
    config: { rateLimit: beforeBodyLimit((request) => userOf(request).id) },
  };
  app.put(edge.sendUrl, options, async (request) => {
    const profile = await edge.replace(userOf(request).id, imageBytesOf(request));
    return { profile } satisfies ProfileResponseDto;
  });
}

// The same 10 a minute as a sent image: each link is a download and a decode. preHandler: the
// JSON body is small, and the guard runs first so the key is the user.
function registerImageLink(app: FastifyInstance, edge: ProfileImageEdge): void {
  const { requireAuth, userOf } = app.authGuards;
  const limit = perUserRateLimit(IMAGE_SENDS_PER_MINUTE, '1 minute', userOf);
  const options = { preHandler: requireAuth, config: { rateLimit: limit } };
  app.post(`${edge.sendUrl}/link`, options, async (request) => {
    const { url } = edge.linkBody.parse(request.body);
    const profile = await edge.replaceFromLink(userOf(request).id, url);
    return { profile } satisfies ProfileResponseDto;
  });
}

// Session required, membership not: the image belongs to the account, and its id only reaches
// whoever shares a table with the person.
function registerImageRead(app: FastifyInstance, edge: ProfileImageEdge): void {
  const { requireAuth } = app.authGuards;
  app.get(edge.readUrl, { preHandler: requireAuth }, async (request, reply) => {
    const stored = await edge.open(edge.imageIdOf(request));
    return reply
      .header('content-type', AVATAR_CONTENT_TYPE)
      .header('content-length', stored.size)
      .header('cache-control', IMAGE_CACHE_CONTROL)
      .header('x-content-type-options', 'nosniff')
      .send(stored.body);
  });
}

function beforeBodyLimit(userIdOf: (request: FastifyRequest) => string): object {
  const timeWindow = '1 minute';
  return { max: IMAGE_SENDS_PER_MINUTE, timeWindow, hook: 'preParsing', keyGenerator: userIdOf };
}

// JSON still has its parser here (the PATCH needs it): a JSON body on a send route is a 415.
function imageBytesOf(request: FastifyRequest): Uint8Array {
  if (Buffer.isBuffer(request.body)) return new Uint8Array(request.body);
  throw new AvatarMediaTypeError(String(request.headers['content-type']));
}

function idParamOf<Params>(
  request: FastifyRequest,
  schema: z.ZodType<Params>,
  idOf: (params: Params) => string,
  notFound: (raw: string) => ProfileError,
): string {
  const parsed = schema.safeParse(request.params);
  if (parsed.success) return idOf(parsed.data);
  throw notFound(JSON.stringify(request.params));
}

function notFoundAvatar(raw: string): ProfileError {
  return new AvatarNotFoundError(raw);
}

function notFoundTexture(raw: string): ProfileError {
  return new DiceTextureNotFoundError(raw);
}
