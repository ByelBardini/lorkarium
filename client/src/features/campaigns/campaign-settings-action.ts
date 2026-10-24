import { updateCampaignRequestDto } from '@lorkarium/contracts';
import { redirect, type ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { CampaignsFailure, CampaignsResult } from '@/services/campaigns-api';

const settingsActionRequest = z.discriminatedUnion('intent', [
  z.strictObject({ intent: z.literal('update'), input: updateCampaignRequestDto }),
  z.strictObject({ intent: z.literal('regenerate-code') }),
  z.strictObject({ intent: z.literal('delete') }),
]);

/** What the settings page sends to its action (JSON); the action revalidates it by the DTO. */
export type SettingsActionRequest = z.input<typeof settingsActionRequest>;
export type SettingsIntent = SettingsActionRequest['intent'];

/** A refusal the page shows; a fallen session never comes back (it goes to the login). */
export type SettingsFailure = Exclude<CampaignsFailure, Readonly<{ kind: 'unauthenticated' }>>;

/** What the action answers to the fetcher that sent the intent (a deletion redirects instead). */
export type SettingsActionResult =
  | Readonly<{ intent: SettingsIntent; done: true }>
  | Readonly<{ intent: SettingsIntent | null; failure: SettingsFailure }>;

/** A command of the settings page refused because the session fell, thrown to the route's
 *  `ErrorBoundary`, which signs out and goes to the login (a fetcher's `redirect` would be dropped
 *  when signing out unmounts it; see `AccountSignedOutError`).
 *
 *  Example: `if (error instanceof CampaignSettingsSignedOutError) return <SignedOutRedirect sessionStore={sessionStore} />` */
export class CampaignSettingsSignedOutError extends Error {
  constructor(readonly intent: SettingsIntent) {
    super(`the API answered unauthenticated to the campaign settings command "${intent}"`);
    this.name = 'CampaignSettingsSignedOutError';
  }
}

/** The master's commands on `/campaigns/:id/table/settings`: save the changed fields (`update`), a new
 *  join code (`regenerate-code`) and `delete`, which closes the table in this tab and goes to `/`.
 *  The router reloads the campaign of the room after it by itself.
 *
 *  Example: `fetcher.submit({ intent: 'regenerate-code' }, { method: 'post', action: '/campaigns/<id>/table/settings', encType: 'application/json' })` */
export function campaignSettingsAction(deps: AppDependencies): ActionFunction {
  return async ({ request, params }): Promise<SettingsActionResult | Response> => {
    const campaignId = params.campaignId ?? '';
    const parsed = settingsActionRequest.safeParse(await request.json());
    if (!parsed.success) return { intent: null, failure: { kind: 'invalid' } };
    const command = parsed.data;
    if (command.intent === 'update') {
      return outcome(await deps.campaignsApi.update(campaignId, command.input), 'update');
    }
    if (command.intent === 'regenerate-code') {
      return outcome(await deps.campaignsApi.regenerateCode(campaignId), 'regenerate-code');
    }
    return deleteCampaign(deps, campaignId);
  };
}

async function deleteCampaign(
  deps: AppDependencies,
  campaignId: string,
): Promise<SettingsActionResult | Response> {
  const result = outcome(await deps.campaignsApi.remove(campaignId), 'delete');
  if ('failure' in result) return result;
  deps.openTables.getState().close(campaignId);
  return redirect('/');
}

function outcome<T>(result: CampaignsResult<T>, intent: SettingsIntent): SettingsActionResult {
  if (result.ok) return { intent, done: true };
  const { failure } = result;
  if (failure.kind === 'unauthenticated') throw new CampaignSettingsSignedOutError(intent);
  return { intent, failure };
}
