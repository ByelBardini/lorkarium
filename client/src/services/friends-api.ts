import {
  BLOCKS_MAX,
  FRIENDS_MAX,
  FRIEND_ERROR_CODES,
  OUTGOING_REQUESTS_MAX,
  blockedUserDto,
  friendDto,
  friendRequestResponseDto,
  friendsOverviewDto,
  type BlockRequestDto,
  type BlockedUserDto,
  type FriendDto,
  type FriendRequestResponseDto,
  type FriendsOverviewDto,
} from '@lorkarium/contracts';
import type { z } from 'zod';
import {
  commandFailureOf,
  type AccountCommonFailure,
  type AccountResult,
  type FailureByCode,
} from './account-failure';
import { callApi, parseOk, type ApiCall } from './api-call';
import type { HttpTransport } from './http-transport';

/** A ceiling the server refused over: `limit` is the number the sentence quotes. */
export type FriendsLimitFailure = Readonly<{
  kind: 'friend_limit' | 'outgoing_request_limit' | 'block_limit';
  limit: number;
}>;

export type FriendsFailure =
  | AccountCommonFailure
  | FriendsLimitFailure
  | Readonly<{
      kind:
        | 'user_not_found'
        | 'already_friends'
        | 'request_already_sent'
        | 'request_to_self'
        | 'user_blocked_by_you'
        | 'request_not_found'
        | 'friend_not_found'
        | 'already_blocked'
        | 'block_not_found';
    }>;

export type FriendsResult<T> = AccountResult<T, FriendsFailure>;

export type FriendRequestOutcome = FriendRequestResponseDto['outcome'];

/** The friends, requests and blocks of the signed-in account; failures come back as values.
 *
 *  Example: `const result = await friendsApi.sendRequest('@bia'); if (result.ok) result.value // 'sent'` */
export interface FriendsApi {
  overview(): Promise<FriendsResult<FriendsOverviewDto>>;
  /** `accepted` when the other one had already asked: they are friends now. */
  sendRequest(username: string): Promise<FriendsResult<FriendRequestOutcome>>;
  acceptRequest(userId: string): Promise<FriendsResult<FriendDto>>;
  /** Declines a received request or cancels a sent one (the same route). */
  dropRequest(userId: string): Promise<FriendsResult<null>>;
  removeFriend(userId: string): Promise<FriendsResult<null>>;
  block(target: BlockRequestDto): Promise<FriendsResult<BlockedUserDto>>;
  unblock(userId: string): Promise<FriendsResult<null>>;
}

const FAILURE_BY_CODE: FailureByCode<FriendsFailure> = {
  [FRIEND_ERROR_CODES.userNotFound]: { kind: 'user_not_found' },
  [FRIEND_ERROR_CODES.alreadyFriends]: { kind: 'already_friends' },
  [FRIEND_ERROR_CODES.requestAlreadySent]: { kind: 'request_already_sent' },
  [FRIEND_ERROR_CODES.requestToSelf]: { kind: 'request_to_self' },
  [FRIEND_ERROR_CODES.userBlockedByYou]: { kind: 'user_blocked_by_you' },
  [FRIEND_ERROR_CODES.requestNotFound]: { kind: 'request_not_found' },
  [FRIEND_ERROR_CODES.friendNotFound]: { kind: 'friend_not_found' },
  [FRIEND_ERROR_CODES.alreadyBlocked]: { kind: 'already_blocked' },
  [FRIEND_ERROR_CODES.blockNotFound]: { kind: 'block_not_found' },
  [FRIEND_ERROR_CODES.friendLimit]: { kind: 'friend_limit', limit: FRIENDS_MAX },
  [FRIEND_ERROR_CODES.outgoingRequestLimit]: {
    kind: 'outgoing_request_limit',
    limit: OUTGOING_REQUESTS_MAX,
  },
  [FRIEND_ERROR_CODES.blockLimit]: { kind: 'block_limit', limit: BLOCKS_MAX },
};

function failed<T>(call: Exclude<ApiCall, { kind: 'ok' }>): FriendsResult<T> {
  return { ok: false, failure: commandFailureOf(call, FAILURE_BY_CODE) };
}

function parsed<S extends z.ZodType>(schema: S, call: ApiCall): FriendsResult<z.infer<S>> {
  if (call.kind !== 'ok') return failed(call);
  return parseOk(schema, call.body, (body) => body);
}

function emptied(call: ApiCall): FriendsResult<null> {
  return call.kind === 'ok' ? { ok: true, value: null } : failed(call);
}

/** `FriendsApi` over HTTP; every 2xx body is validated by its DTO (outside it: `unexpected`).
 *
 *  Example: `await new HttpFriendsApi(transport).block({ username: 'thiagaum' })` */
export class HttpFriendsApi implements FriendsApi {
  constructor(private readonly transport: HttpTransport) {}

  async overview(): Promise<FriendsResult<FriendsOverviewDto>> {
    return parsed(friendsOverviewDto, await callApi(this.transport, 'GET', '/friends'));
  }

  async sendRequest(username: string): Promise<FriendsResult<FriendRequestOutcome>> {
    const call = await callApi(this.transport, 'POST', '/friends/requests', { username });
    const result = parsed(friendRequestResponseDto, call);
    return result.ok ? { ok: true, value: result.value.outcome } : result;
  }

  async acceptRequest(userId: string): Promise<FriendsResult<FriendDto>> {
    const path = `/friends/requests/${encodeURIComponent(userId)}/accept`;
    return parsed(friendDto, await callApi(this.transport, 'POST', path));
  }

  async dropRequest(userId: string): Promise<FriendsResult<null>> {
    const path = `/friends/requests/${encodeURIComponent(userId)}`;
    return emptied(await callApi(this.transport, 'DELETE', path));
  }

  async removeFriend(userId: string): Promise<FriendsResult<null>> {
    const path = `/friends/${encodeURIComponent(userId)}`;
    return emptied(await callApi(this.transport, 'DELETE', path));
  }

  async block(target: BlockRequestDto): Promise<FriendsResult<BlockedUserDto>> {
    return parsed(blockedUserDto, await callApi(this.transport, 'POST', '/blocks', target));
  }

  async unblock(userId: string): Promise<FriendsResult<null>> {
    const path = `/blocks/${encodeURIComponent(userId)}`;
    return emptied(await callApi(this.transport, 'DELETE', path));
  }
}
