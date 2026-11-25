import {
  CUSTOM_EMOJI_ERROR_CODES,
  customEmojiListDto,
  type CustomEmojiListDto,
} from '@lorkarium/contracts';
import {
  planAwareFailureOf,
  type AccountCommonFailure,
  type AccountResult,
  type FailureByCode,
} from './account-failure';
import { callApi, callUpload, parseOk, type ApiCall, type PlanLimitFailure } from './api-call';
import type { HttpTransport } from './http-transport';

export type CustomEmojisFailure =
  | AccountCommonFailure
  | Readonly<{ kind: 'name_taken' }>
  | Readonly<{ kind: 'too_large' }>
  | Readonly<{ kind: 'unsupported_image' }>
  | Readonly<{ kind: 'not_found' }>
  /** Grátis, or the plan's ceiling reached: 403 `PLAN_LIMIT`. */
  | PlanLimitFailure;

/** The emojis of the account (oldest first) and the plan's ceiling, or why the call failed. */
export type CustomEmojisResult = AccountResult<CustomEmojiListDto, CustomEmojisFailure>;

/** The custom emojis of the logged-in account. Failures come back as values.
 *
 *  Example: `const result = await emojis.create('festa', file); if (result.ok) result.value.emojis` */
export interface CustomEmojisApi {
  list(): Promise<CustomEmojisResult>;
  create(name: string, picture: Blob): Promise<CustomEmojisResult>;
  rename(emojiId: string, name: string): Promise<CustomEmojisResult>;
  remove(emojiId: string): Promise<CustomEmojisResult>;
}

const CUSTOM_EMOJIS_PATH = '/account/custom-emojis';

const FAILURE_BY_CODE: FailureByCode<CustomEmojisFailure> = {
  [CUSTOM_EMOJI_ERROR_CODES.nameTaken]: { kind: 'name_taken' },
  [CUSTOM_EMOJI_ERROR_CODES.tooLarge]: { kind: 'too_large' },
  [CUSTOM_EMOJI_ERROR_CODES.notFound]: { kind: 'not_found' },
  UNSUPPORTED_IMAGE: { kind: 'unsupported_image' },
};

function resultOf(call: ApiCall): CustomEmojisResult {
  if (call.kind !== 'ok') {
    return { ok: false, failure: planAwareFailureOf(call, FAILURE_BY_CODE) };
  }
  return parseOk(customEmojiListDto, call.body, (body) => body);
}

/** `CustomEmojisApi` over HTTP: every route answers the whole list, validated by the DTO.
 *
 *  Example: `await new HttpCustomEmojisApi(transport).remove(emojiId)` */
export class HttpCustomEmojisApi implements CustomEmojisApi {
  constructor(private readonly transport: HttpTransport) {}

  async list(): Promise<CustomEmojisResult> {
    return resultOf(await callApi(this.transport, 'GET', CUSTOM_EMOJIS_PATH));
  }

  async create(name: string, picture: Blob): Promise<CustomEmojisResult> {
    const path = `${CUSTOM_EMOJIS_PATH}?name=${encodeURIComponent(name)}`;
    return resultOf(await callUpload(this.transport, path, picture));
  }

  async rename(emojiId: string, name: string): Promise<CustomEmojisResult> {
    const path = `${CUSTOM_EMOJIS_PATH}/${emojiId}`;
    return resultOf(await callApi(this.transport, 'PATCH', path, { name }));
  }

  async remove(emojiId: string): Promise<CustomEmojisResult> {
    const path = `${CUSTOM_EMOJIS_PATH}/${emojiId}`;
    return resultOf(await callApi(this.transport, 'DELETE', path));
  }
}
