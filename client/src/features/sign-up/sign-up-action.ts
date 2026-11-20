import { signUpRequestDto } from '@lorkarium/contracts';
import type { ActionFunction, LoaderFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { SignUpFailure } from '@/services/sign-up-api';

const signUpIntentDto = z.discriminatedUnion('intent', [
  signUpRequestDto.extend({ intent: z.literal('sign-up') }),
]);

export type SignUpIntent = z.input<typeof signUpIntentDto>;

export type SignUpActionResult =
  | Readonly<{ intent: SignUpIntent['intent']; sent: true }>
  | Readonly<{ intent: SignUpIntent['intent'] | null; failure: SignUpFailure }>;

/** The requests of the public pages without an account (`/sign-up`): the answer is the same 202
 *  whether the account exists or not, so `sent` says only that the server took the request.
 *
 *  Example: `fetcher.submit({ intent: 'sign-up', email, humanCheckToken }, { method: 'post', encType: 'application/json' })` */
export function signUpAction({ signUpApi }: AppDependencies): ActionFunction {
  return async ({ request }): Promise<SignUpActionResult> => {
    const parsed = signUpIntentDto.safeParse(await request.json());
    if (!parsed.success) return { intent: null, failure: { kind: 'invalid' } };
    const { intent, ...input } = parsed.data;
    const result = await signUpApi.requestSignUp(input);
    return result.ok ? { intent, sent: true } : { intent, failure: result.failure };
  };
}

/** The sign-up settings for the login and the public forms: whether registration is open and the
 *  Turnstile site key; a failure is kept for the page to say.
 *
 *  Example: `{ path: 'sign-up', loader: signUpSettingsLoader(deps), … }` */
export function signUpSettingsLoader({ signUpApi }: AppDependencies): LoaderFunction {
  return () => signUpApi.settings();
}
