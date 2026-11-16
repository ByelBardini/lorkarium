import {
  adminBadgeResponseDto,
  adminBadgesResponseDto,
  apiErrorDto,
  badgeOrderRequestDto,
  createBadgeRequestDto,
  updateBadgeRequestDto,
  userBadgeIdsResponseDto,
  userBadgesRequestDto,
  userBadgesResponseDto,
  type AdminBadgeDto,
  type BadgeDto,
  type CreateBadgeRequestDto,
  type UpdateBadgeRequestDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import { callApi, callUpload, parseOk, type ApiCall } from './api-call';
import { appendCropTo, type ImageCropRect } from './assets-api';
import type { HttpTransport } from './http-transport';
import { userAdminFailureOf, type UserAdminFailure } from './user-admin-api';

/** Every refusal of the badge routes the backoffice tells apart: the backoffice's own plus the
 *  catalog's (a taken name, a stale order, a badge without image, an image refused). */
export type BadgesAdminFailure = UserAdminFailure | BadgeCatalogFailure;

/** The refusals only the catalog has. */
export type BadgeCatalogFailure =
  | Readonly<{ kind: 'name_taken' }>
  | Readonly<{ kind: 'order_stale' }>
  | Readonly<{ kind: 'badge_without_image' }>
  | Readonly<{ kind: 'image_too_large' }>
  | Readonly<{ kind: 'unsupported_image' }>;

export type BadgesAdminResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; failure: BadgesAdminFailure }>;

/** The badge catalog of the backoffice and the grants per account (`/api/admin/badges`,
 *  `/api/admin/users/:userId/badges`); failures come back as values, never thrown. */
export interface BadgesAdminApi {
  /** The catalog in its order, badges without image included. */
  catalog(): Promise<BadgesAdminResult<AdminBadgeDto[]>>;
  /** A new badge, last in the order and without image (the image goes by `uploadImage`). */
  create(input: CreateBadgeRequestDto): Promise<BadgesAdminResult<AdminBadgeDto>>;
  update(badgeId: string, input: UpdateBadgeRequestDto): Promise<BadgesAdminResult<AdminBadgeDto>>;
  uploadImage(
    badgeId: string,
    file: Blob,
    crop: ImageCropRect,
  ): Promise<BadgesAdminResult<AdminBadgeDto>>;
  /** Every catalog id once, in the new order. */
  reorder(badgeIds: readonly string[]): Promise<BadgesAdminResult<AdminBadgeDto[]>>;
  remove(badgeId: string): Promise<BadgesAdminResult<null>>;
  /** The ids an account holds, image or not. */
  grantsOf(userId: string): Promise<BadgesAdminResult<string[]>>;
  /** Replaces the account's set (`[]` takes every badge away). */
  grant(userId: string, badgeIds: readonly string[]): Promise<BadgesAdminResult<BadgeDto[]>>;
}

const FAILURE_BY_CODE: Readonly<Record<string, BadgesAdminFailure>> = {
  BADGE_NAME_TAKEN: { kind: 'name_taken' },
  BADGE_ORDER_STALE: { kind: 'order_stale' },
  BADGE_WITHOUT_IMAGE: { kind: 'badge_without_image' },
  BADGE_NOT_FOUND: { kind: 'not_found' },
  BADGE_IMAGE_TOO_LARGE: { kind: 'image_too_large' },
  UNSUPPORTED_IMAGE: { kind: 'unsupported_image' },
};

// Fastify answers a body over the limit or of another type before the route's own code.
const FAILURE_BY_STATUS: Readonly<Record<number, BadgesAdminFailure>> = {
  413: { kind: 'image_too_large' },
  415: { kind: 'unsupported_image' },
};

/** `BadgesAdminApi` over HTTP: the bodies pass their DTO before leaving, the answers after.
 *
 *  Example: `const result = await new HttpBadgesAdminApi(transport).catalog(); if (result.ok) …` */
export class HttpBadgesAdminApi implements BadgesAdminApi {
  constructor(private readonly transport: HttpTransport) {}

  async catalog(): Promise<BadgesAdminResult<AdminBadgeDto[]>> {
    const call = await callApi(this.transport, 'GET', '/admin/badges');
    return answerOf(call, adminBadgesResponseDto, (body) => body.badges);
  }

  async create(input: CreateBadgeRequestDto): Promise<BadgesAdminResult<AdminBadgeDto>> {
    const body = createBadgeRequestDto.parse(input);
    const call = await callApi(this.transport, 'POST', '/admin/badges', body);
    return answerOf(call, adminBadgeResponseDto, (parsed) => parsed.badge);
  }

  async update(
    badgeId: string,
    input: UpdateBadgeRequestDto,
  ): Promise<BadgesAdminResult<AdminBadgeDto>> {
    const body = updateBadgeRequestDto.parse(input);
    const call = await callApi(this.transport, 'PATCH', badgePath(badgeId), body);
    return answerOf(call, adminBadgeResponseDto, (parsed) => parsed.badge);
  }

  async uploadImage(
    badgeId: string,
    file: Blob,
    crop: ImageCropRect,
  ): Promise<BadgesAdminResult<AdminBadgeDto>> {
    const query = new URLSearchParams();
    appendCropTo(query, crop);
    const path = `${badgePath(badgeId)}/image?${query.toString()}`;
    const call = await callUpload(this.transport, path, file, 'PUT');
    return answerOf(call, adminBadgeResponseDto, (parsed) => parsed.badge);
  }

  async reorder(badgeIds: readonly string[]): Promise<BadgesAdminResult<AdminBadgeDto[]>> {
    const body = badgeOrderRequestDto.parse({ badgeIds });
    const call = await callApi(this.transport, 'PUT', '/admin/badges/order', body);
    return answerOf(call, adminBadgesResponseDto, (parsed) => parsed.badges);
  }

  async remove(badgeId: string): Promise<BadgesAdminResult<null>> {
    const call = await callApi(this.transport, 'DELETE', badgePath(badgeId));
    if (call.kind === 'ok') return { ok: true, value: null };
    return { ok: false, failure: badgesFailureOf(call) };
  }

  async grantsOf(userId: string): Promise<BadgesAdminResult<string[]>> {
    const call = await callApi(this.transport, 'GET', userBadgesPath(userId));
    return answerOf(call, userBadgeIdsResponseDto, (body) => body.badgeIds);
  }

  async grant(userId: string, badgeIds: readonly string[]): Promise<BadgesAdminResult<BadgeDto[]>> {
    const body = userBadgesRequestDto.parse({ badgeIds });
    const call = await callApi(this.transport, 'PUT', userBadgesPath(userId), body);
    return answerOf(call, userBadgesResponseDto, (parsed) => parsed.badges);
  }
}

function badgePath(badgeId: string): string {
  return `/admin/badges/${encodeURIComponent(badgeId)}`;
}

function userBadgesPath(userId: string): string {
  return `/admin/users/${encodeURIComponent(userId)}/badges`;
}

function answerOf<S extends z.ZodType, T>(
  call: ApiCall,
  schema: S,
  pick: (parsed: z.infer<S>) => T,
): BadgesAdminResult<T> {
  if (call.kind !== 'ok') return { ok: false, failure: badgesFailureOf(call) };
  return parseOk(schema, call.body, pick);
}

function badgesFailureOf(call: Exclude<ApiCall, { kind: 'ok' }>): BadgesAdminFailure {
  if (call.kind === 'offline') return { kind: 'offline' };
  const body = apiErrorDto.safeParse(call.response.body);
  const byCode = body.success ? FAILURE_BY_CODE[body.data.code] : undefined;
  return byCode ?? FAILURE_BY_STATUS[call.response.status] ?? userAdminFailureOf(call);
}
