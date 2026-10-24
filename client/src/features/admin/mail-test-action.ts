import { sendMailSampleRequestDto } from '@lorkarium/contracts';
import type { ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { UserAdminFailure } from '@/services/user-admin-api';
import { AdminForbiddenError, AdminSignedOutError, dropAdminRole } from './users-action';

const mailTestIntentDto = sendMailSampleRequestDto.extend({ sampleId: z.string().min(1) });

export type MailTestIntent = z.input<typeof mailTestIntentDto>;

export type MailTestResult =
  Readonly<{ subject: string; to: string }> | Readonly<{ failure: UserAdminFailure }>;

/** Sends one sample of a system e-mail; a fallen session or a lost role goes to the
 *  ErrorBoundary, like the users page.
 *
 *  Example: `fetcher.submit({ sampleId: 'invitation', to }, { method: 'post', encType: 'application/json' })` */
export function mailTestAction(deps: AppDependencies): ActionFunction {
  return async ({ request }): Promise<MailTestResult> => {
    const parsed = mailTestIntentDto.safeParse(await request.json());
    if (!parsed.success) return { failure: { kind: 'invalid' } };
    const result = await deps.userAdminApi.sendMailSample(parsed.data.sampleId, parsed.data.to);
    if (result.ok) return result.value;
    if (result.failure.kind === 'unauthenticated') {
      deps.sessionStore.getState().signedOut();
      throw new AdminSignedOutError();
    }
    if (result.failure.kind === 'forbidden') {
      dropAdminRole(deps);
      throw new AdminForbiddenError();
    }
    return { failure: result.failure };
  };
}
