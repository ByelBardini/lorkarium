import { accountPlanDto, type AccountPlanDto } from '@lorkarium/contracts';
import { callApi, parseOk } from './api-call';
import { loadFailureOf, type AccountLoadFailure, type AccountResult } from './account-failure';
import type { HttpTransport } from './http-transport';

/** What "Seu plano" in "Minha conta" needs from `/api/account/plan`; failures come back as
 *  values, never thrown. */
export interface AccountPlanApi {
  /** The stored plan, the effective limits and what the account already spends of them. */
  get(): Promise<AccountResult<AccountPlanDto, AccountLoadFailure>>;
}

/** `AccountPlanApi` over HTTP: validates the answer by the contracts DTO.
 *
 *  Example: `const result = await new HttpAccountPlanApi(transport).get(); if (result.ok) result.value.usage` */
export class HttpAccountPlanApi implements AccountPlanApi {
  constructor(private readonly transport: HttpTransport) {}

  async get(): Promise<AccountResult<AccountPlanDto, AccountLoadFailure>> {
    const call = await callApi(this.transport, 'GET', '/account/plan');
    if (call.kind !== 'ok') return { ok: false, failure: loadFailureOf(call) };
    return parseOk(accountPlanDto, call.body, (plan) => plan);
  }
}
