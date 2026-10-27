import {
  joinPublicCampaignRequestDto,
  type JoinPublicCampaignRequestDto,
} from '@lorkarium/contracts';
import { redirect, type ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import { redirectIfSignedOut } from '@/app/shell/api-loader';
import type { CampaignsFailure } from '@/services/campaigns-api';

/** What "Entrar" sends to the explore action (JSON). */
export type ExploreActionRequest = Readonly<{
  campaignId: string;
  input: JoinPublicCampaignRequestDto;
}>;

/** What "Entrar como juggernaut" (admin) sends to the explore action (JSON). */
export type ExploreJuggernautRequest = Readonly<{ intent: 'juggernaut'; campaignId: string }>;

/** A refused join, tied to the campaign it was for (each row shows only its own). */
export type ExploreActionResult = Readonly<{ campaignId: string; failure: CampaignsFailure }>;

const exploreActionRequest = z.union([
  z.strictObject({ campaignId: z.uuid(), input: joinPublicCampaignRequestDto }),
  z.strictObject({ intent: z.literal('juggernaut'), campaignId: z.uuid() }),
]);

/** Joins a public campaign (or, for an admin, turns juggernaut mode on at any listed campaign)
 *  and opens its detail over the home ("Entrar na mesa" is there); a refusal comes back to the
 *  row that asked.
 *
 *  Example: `fetcher.submit({ campaignId, input: { password } }, { method: 'post', encType: 'application/json' })` */
export function exploreAction({ campaignsApi, sessionStore }: AppDependencies): ActionFunction {
  return async ({ request }): Promise<ExploreActionResult | Response> => {
    const parsed = exploreActionRequest.safeParse(await request.json());
    if (!parsed.success) return { campaignId: '', failure: { kind: 'invalid' } };
    const { campaignId } = parsed.data;
    const result =
      'intent' in parsed.data
        ? await campaignsApi.startJuggernaut(campaignId)
        : await campaignsApi.joinPublic(campaignId, parsed.data.input);
    if (result.ok) return redirect(`/campaigns/${campaignId}`);
    redirectIfSignedOut(result.failure, request, sessionStore);
    return { campaignId, failure: result.failure };
  };
}
