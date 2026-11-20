import { publishFeedbackRequestDto, type PublishFeedbackResponseDto } from '@lorkarium/contracts';
import type { ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { FeedbackAdminFailure } from '@/services/feedback-admin-api';
import { AdminForbiddenError, AdminSignedOutError, dropAdminRole } from './users-action';

const feedbackIntentDto = z.discriminatedUnion('intent', [
  publishFeedbackRequestDto.extend({ intent: z.literal('publish'), entryId: z.string().min(1) }),
  z.strictObject({ intent: z.literal('archive'), entryId: z.string().min(1) }),
]);

export type FeedbackIntent = z.input<typeof feedbackIntentDto>;

export type FeedbackActionResult =
  | Readonly<{ published: PublishFeedbackResponseDto }>
  | Readonly<{ archived: true }>
  | Readonly<{ failure: FeedbackAdminFailure }>;

/** Publishes one entry as a GitHub issue (with the admin's title and body) or archives it; the
 *  reload after it takes the entry out of the queue. A fallen session or a lost role goes to the
 *  ErrorBoundary, like the users page.
 *
 *  Example: `fetcher.submit({ intent: 'publish', entryId, title, body }, { method: 'post', encType: 'application/json' })` */
export function feedbackAction(deps: AppDependencies): ActionFunction {
  return async ({ request }): Promise<FeedbackActionResult> => {
    const parsed = feedbackIntentDto.safeParse(await request.json());
    if (!parsed.success) return { failure: { kind: 'invalid' } };
    const result = await runIntent(deps, parsed.data);
    if ('failure' in result) refuseFallenSession(deps, result.failure);
    return result;
  };
}

async function runIntent(
  deps: AppDependencies,
  intent: z.output<typeof feedbackIntentDto>,
): Promise<FeedbackActionResult> {
  if (intent.intent === 'archive') {
    const archived = await deps.feedbackAdminApi.archive(intent.entryId);
    return archived.ok ? { archived: true } : { failure: archived.failure };
  }
  const { title, body } = intent;
  const published = await deps.feedbackAdminApi.publish(intent.entryId, { title, body });
  return published.ok ? { published: published.value } : { failure: published.failure };
}

function refuseFallenSession(deps: AppDependencies, failure: FeedbackAdminFailure): void {
  if (failure.kind === 'unauthenticated') {
    deps.sessionStore.getState().signedOut();
    throw new AdminSignedOutError();
  }
  if (failure.kind === 'forbidden') {
    dropAdminRole(deps);
    throw new AdminForbiddenError();
  }
}
