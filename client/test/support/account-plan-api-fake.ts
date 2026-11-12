import { PLAN_LIMITS, type AccountPlanDto, type UserPlan } from '@lorkarium/contracts';
import type { AccountPlanApi } from '@/services/account-plan-api';
import type { AccountLoadFailure, AccountResult } from '@/services/account-failure';
import { ANA } from './auth-api-fake';
import { ScriptedAnswers } from './scripted-answers';

const MEBIBYTE = 1024 * 1024;

/** "Seu plano" of an account on `plan`, with the limits of that same plan (an admin is
 *  `accountPlanOf('free', { limitsOf: 'amigo_do_dono' })`).
 *
 *  Example: `accountPlanOf('free', { campaignsOwned: 1, storageMegabytes: 40 })` */
export function accountPlanOf(
  plan: UserPlan,
  options: Readonly<{
    campaignsOwned?: number;
    storageMegabytes?: number;
    limitsOf?: UserPlan;
  }> = {},
): AccountPlanDto {
  const limitsOf = options.limitsOf ?? plan;
  return {
    plan,
    limits: PLAN_LIMITS[limitsOf],
    customization: plan !== 'free' || limitsOf !== 'free',
    usage: {
      campaignsOwned: options.campaignsOwned ?? 0,
      storageBytes: (options.storageMegabytes ?? 0) * MEBIBYTE,
    },
  };
}

/** Ana's plan, matching `ANA` of the auth fake (Amigo do Dono, no table yet). */
export const ANA_PLAN: AccountPlanDto = accountPlanOf(ANA.plan);

type Answers = {
  get: AccountResult<AccountPlanDto, AccountLoadFailure>;
};

/** An `AccountPlanApi` that answers `plan` (Ana's by default); `get` can be scripted (`answer`, `hold`). */
export class AccountPlanApiFake implements AccountPlanApi {
  plan: AccountPlanDto = ANA_PLAN;
  readonly answers = new ScriptedAnswers<Answers>();

  get(): Promise<Answers['get']> {
    return this.answers.reply('get', undefined, () => ({ ok: true, value: this.plan }));
  }
}
