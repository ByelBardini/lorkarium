import { resolveUserReportRequestDto, type UserReportDto } from '@lorkarium/contracts';
import type { ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { UserAdminFailure } from '@/services/user-admin-api';
import { AdminForbiddenError, AdminSignedOutError, dropAdminRole } from './users-action';

const resolveReportIntentDto = resolveUserReportRequestDto.extend({ reportId: z.string().min(1) });

export type ResolveReportIntent = z.input<typeof resolveReportIntentDto>;

export type ResolveReportResult =
  Readonly<{ report: UserReportDto }> | Readonly<{ failure: UserAdminFailure }>;

/** Resolves (with the admin's note) or dismisses one report; the reload after it takes the report
 *  out of the open queue.
 *  A fallen session or a lost role goes to the ErrorBoundary, like the users page.
 *
 *  Example: `fetcher.submit({ reportId, status: 'resolved', note: 'warned' }, { method: 'post', encType: 'application/json' })` */
export function reportsAction(deps: AppDependencies): ActionFunction {
  return async ({ request }): Promise<ResolveReportResult> => {
    const parsed = resolveReportIntentDto.safeParse(await request.json());
    if (!parsed.success) return { failure: { kind: 'invalid' } };
    const { reportId, ...closing } = parsed.data;
    const result = await deps.userReportsApi.resolve(reportId, closing);
    if (result.ok) return { report: result.value };
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
