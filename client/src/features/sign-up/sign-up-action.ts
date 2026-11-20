import { passwordResetRequestDto, signUpRequestDto } from '@lorkarium/contracts';
import type { ActionFunction, LoaderFunction } from 'react-router';
import { z } from 'zod';
import type { AppDependencies } from '@/app/router';
import type { SignUpApi, SignUpFailure, SignUpResult } from '@/services/sign-up-api';

const signUpIntentDto = z.discriminatedUnion('intent', [
  signUpRequestDto.extend({ intent: z.literal('sign-up') }),
  passwordResetRequestDto.extend({ intent: z.literal('request-reset') }),
]);

export type SignUpIntent = z.input<typeof signUpIntentDto>;

export type SignUpActionResult =
  | Readonly<{ intent: SignUpIntent['intent']; sent: true }>
  | Readonly<{ intent: SignUpIntent['intent'] | null; failure: SignUpFailure }>;

/** The requests of the public pages without an account (`/sign-up`, `/forgot-password`): the answer is the same 202
 *  whether the account exists or not, so `sent` says only that the server took the request.
 *
 *  Example: `fetcher.submit({ intent: 'sign-up', email, humanCheckToken }, { method: 'post', encType: 'application/json' })` */
export function signUpAction({ signUpApi }: AppDependencies): ActionFunction {
  return async ({ request }): Promise<SignUpActionResult> => {
    const parsed = signUpIntentDto.safeParse(await request.json());
    if (!parsed.success) return { intent: null, failure: { kind: 'invalid' } };
    const result = await requestOf(signUpApi, parsed.data);
    const { intent } = parsed.data;
    return result.ok ? { intent, sent: true } : { intent, failure: result.failure };
  };
}

function requestOf(
  api: SignUpApi,
  input: z.infer<typeof signUpIntentDto>,
): Promise<SignUpResult<null>> {
  if (input.intent === 'sign-up') {
    return api.requestSignUp({ email: input.email, humanCheckToken: input.humanCheckToken });
  }
  const { identifier, humanCheckToken } = input;
  return api.requestPasswordReset({ identifier, humanCheckToken });
}

/** The sign-up settings for the login and the public forms: whether registration is open and the
 *  Turnstile site key; a failure is kept for the page to say.
 *
 *  Example: `{ path: 'sign-up', loader: signUpSettingsLoader(deps), … }` */
export function signUpSettingsLoader({ signUpApi }: AppDependencies): LoaderFunction {
  return () => signUpApi.settings();
}
