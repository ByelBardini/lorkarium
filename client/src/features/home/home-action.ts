import {
  createCampaignRequestDto,
  joinCampaignRequestDto,
  type CampaignDetailDto,
  type CampaignSummaryDto,
  type CreateCampaignRequestDto,
  type JoinCampaignRequestDto,
} from '@lorkarium/contracts';
import type { ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import { redirectIfSignedOut } from '@/app/shell/api-loader';
import type { CampaignsFailure, CampaignsResult } from '@/services/campaigns-api';

/** What the home dialogs send to the home action (JSON), already normalized by the DTO. */
export type HomeActionRequest =
  | Readonly<{ intent: 'create'; input: CreateCampaignRequestDto }>
  | Readonly<{ intent: 'join'; input: JoinCampaignRequestDto }>;

export type HomeActionResult =
  | Readonly<{ created: CampaignDetailDto }>
  | Readonly<{ joined: CampaignSummaryDto }>
  | Readonly<{ failure: CampaignsFailure }>;

const homeActionRequest = z.discriminatedUnion('intent', [
  z.strictObject({ intent: z.literal('create'), input: createCampaignRequestDto }),
  z.strictObject({ intent: z.literal('join'), input: joinCampaignRequestDto }),
]);

const INVALID: HomeActionResult = { failure: { kind: 'invalid' } };

/** Creates or joins a campaign; after it the router reloads the list by itself.
 *
 *  Example: `{ id: 'home', action: homeAction(deps) }` and `fetcher.submit({ intent: 'join', input }, JSON)` */
export function homeAction({ campaignsApi, sessionStore }: AppDependencies): ActionFunction {
  return async ({ request }): Promise<HomeActionResult> => {
    const parsed = homeActionRequest.safeParse(await request.json());
    if (!parsed.success) return INVALID;
    const command = parsed.data;
    if (command.intent === 'create') {
      const result = await campaignsApi.create(command.input);
      return outcomeOf(result, request, (created) => ({ created }));
    }
    const result = await campaignsApi.join(command.input);
    return outcomeOf(result, request, (joined) => ({ joined }));
  };

  function outcomeOf<T>(
    result: CampaignsResult<T>,
    request: Request,
    wrap: (value: T) => HomeActionResult,
  ): HomeActionResult {
    if (result.ok) return wrap(result.value);
    redirectIfSignedOut(result.failure, request, sessionStore);
    return { failure: result.failure };
  }
}
