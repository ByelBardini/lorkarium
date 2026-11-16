import {
  badgeOrderRequestDto,
  createBadgeRequestDto,
  type AdminBadgeDto,
} from '@lorkarium/contracts';
import type { ActionFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { BadgesAdminFailure, BadgesAdminResult } from '@/services/badges-admin-api';
import { AdminForbiddenError, AdminSignedOutError, dropAdminRole } from './users-action';

const badgeTarget = { badgeId: z.string().min(1) };

const badgesIntentDto = z.discriminatedUnion('intent', [
  createBadgeRequestDto.extend({ intent: z.literal('create') }),
  z.strictObject({
    intent: z.literal('update'),
    ...badgeTarget,
    name: createBadgeRequestDto.shape.name,
    description: createBadgeRequestDto.shape.description,
  }),
  badgeOrderRequestDto.extend({ intent: z.literal('order') }),
  z.strictObject({ intent: z.literal('delete'), ...badgeTarget }),
]);

export type BadgesIntent = z.input<typeof badgesIntentDto>;
export type BadgesIntentName = BadgesIntent['intent'];

export type BadgesActionResult =
  | Readonly<{ intent: 'create' | 'update'; badge: AdminBadgeDto }>
  | Readonly<{ intent: 'order' | 'delete'; done: true }>
  | Readonly<{ intent: BadgesIntentName | null; failure: BadgesAdminFailure }>;

/** Every text command of the badge catalog, one intent per JSON body (the image goes straight to
 *  the service: a `File` does not travel in JSON); a fallen session or a lost role goes to the
 *  ErrorBoundary. The router reloads the catalog after each one, a refused one included.
 *
 *  Example: `fetcher.submit({ intent: 'delete', badgeId }, { method: 'post', encType: 'application/json' })` */
export function badgesAction(deps: AppDependencies): ActionFunction {
  return async ({ request }): Promise<BadgesActionResult> => {
    const parsed = badgesIntentDto.safeParse(await request.json());
    if (!parsed.success) return { intent: null, failure: { kind: 'invalid' } };
    const result = await run(deps, parsed.data);
    if ('failure' in result) refuseSession(deps, result.failure);
    return result;
  };
}

/** A fallen session or a lost role during a badge command: out to the ErrorBoundary.
 *
 *  Example: `if (!result.ok) refuseSession(deps, result.failure)` */
export function refuseSession(
  deps: Pick<AppDependencies, 'sessionStore'>,
  failure: BadgesAdminFailure,
): void {
  if (failure.kind === 'unauthenticated') {
    deps.sessionStore.getState().signedOut();
    throw new AdminSignedOutError();
  }
  if (failure.kind === 'forbidden') {
    dropAdminRole(deps);
    throw new AdminForbiddenError();
  }
}

async function run(
  { badgesAdminApi: api }: AppDependencies,
  input: z.output<typeof badgesIntentDto>,
): Promise<BadgesActionResult> {
  switch (input.intent) {
    case 'create':
      return badgeResult(input.intent, await api.create(textsOf(input)));
    case 'update':
      return badgeResult(input.intent, await api.update(input.badgeId, textsOf(input)));
    case 'order':
      return doneResult(input.intent, await api.reorder(input.badgeIds));
    case 'delete':
      return doneResult(input.intent, await api.remove(input.badgeId));
  }
}

type BadgeTexts = Readonly<{ name: string; description: string }>;

function textsOf(input: BadgeTexts): BadgeTexts {
  return { name: input.name, description: input.description };
}

function badgeResult(
  intent: 'create' | 'update',
  result: BadgesAdminResult<AdminBadgeDto>,
): BadgesActionResult {
  return result.ok ? { intent, badge: result.value } : { intent, failure: result.failure };
}

function doneResult(
  intent: 'order' | 'delete',
  result: BadgesAdminResult<unknown>,
): BadgesActionResult {
  return result.ok ? { intent, done: true } : { intent, failure: result.failure };
}
