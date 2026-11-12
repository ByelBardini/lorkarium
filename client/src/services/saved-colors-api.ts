import {
  SAVED_COLORS_LIMIT_CODE,
  savedColorsResponseDto,
  type HexColorDto,
} from '@lorkarium/contracts';
import {
  planAwareFailureOf,
  type AccountCommonFailure,
  type AccountResult,
  type FailureByCode,
} from './account-failure';
import { callApi, parseOk, type ApiCall, type PlanLimitFailure } from './api-call';
import type { HttpTransport } from './http-transport';

export type SavedColorsFailure =
  | AccountCommonFailure
  | Readonly<{ kind: 'saved_colors_limit' }>
  /** The person's plan has no custom color: 403 `PLAN_LIMIT`. */
  | PlanLimitFailure;

/** The whole list of the account (most recent first), or why the call failed. */
export type SavedColorsResult = AccountResult<readonly HexColorDto[], SavedColorsFailure>;

/** The colors the logged-in account saved. Failures come back as values.
 *
 *  Example: `const result = await savedColors.save('#336699'); if (result.ok) result.value` */
export interface SavedColorsApi {
  list(): Promise<SavedColorsResult>;
  save(color: HexColorDto): Promise<SavedColorsResult>;
  remove(color: HexColorDto): Promise<SavedColorsResult>;
}

const SAVED_COLORS_PATH = '/account/saved-colors';

const FAILURE_BY_CODE: FailureByCode<SavedColorsFailure> = {
  [SAVED_COLORS_LIMIT_CODE]: { kind: 'saved_colors_limit' },
};

function resultOf(call: ApiCall): SavedColorsResult {
  if (call.kind !== 'ok') {
    return { ok: false, failure: planAwareFailureOf(call, FAILURE_BY_CODE) };
  }
  return parseOk(savedColorsResponseDto, call.body, (body) => body.colors);
}

/** `SavedColorsApi` over HTTP: every route answers the whole list, validated by the DTO.
 *
 *  Example: `await new HttpSavedColorsApi(transport).remove('#aabbcc')` */
export class HttpSavedColorsApi implements SavedColorsApi {
  constructor(private readonly transport: HttpTransport) {}

  async list(): Promise<SavedColorsResult> {
    return resultOf(await callApi(this.transport, 'GET', SAVED_COLORS_PATH));
  }

  async save(color: HexColorDto): Promise<SavedColorsResult> {
    return resultOf(await callApi(this.transport, 'POST', SAVED_COLORS_PATH, { color }));
  }

  async remove(color: HexColorDto): Promise<SavedColorsResult> {
    // Without the #, which a URL would read as the start of a fragment.
    const path = `${SAVED_COLORS_PATH}/${color.slice(1)}`;
    return resultOf(await callApi(this.transport, 'DELETE', path));
  }
}
