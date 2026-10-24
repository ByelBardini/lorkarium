import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { Secret, TOTP } from 'otpauth';

/** The value of cookie `name` set by `response`; throws citing what was set instead.
 *
 *  Example: `const challenge = cookieOf(response, 'lk_2fa').value` */
export function cookieOf(
  response: LightMyRequestResponse,
  name: string,
): LightMyRequestResponse['cookies'][number] {
  const cookie = response.cookies.find((candidate) => candidate.name === name);
  if (!cookie) throw new Error(`expected a ${name} cookie, got ${response.headers['set-cookie']}`);
  return cookie;
}

/** The app code of `secret` (base32) at `at`, the way an authenticator app computes it.
 *
 *  Example: `totpCodeAt(setup.secret, clock.now()) // '287082'` */
export function totpCodeAt(secret: string, at: Date): string {
  return TOTP.generate({ secret: Secret.fromBase32(secret), timestamp: at.getTime() });
}

export type AccountRequest = Readonly<{
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  token?: string;
  payload?: object;
  userAgent?: string;
}>;

/** One request to the app as a signed-in device (`token` = its `lk_session`).
 *
 *  Example: `await accountRequest(app, { method: 'GET', url: '/api/account/sessions', token })` */
export function accountRequest(
  app: FastifyInstance,
  request: AccountRequest,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method: request.method,
    url: request.url,
    cookies: request.token ? { lk_session: request.token } : {},
    headers: request.userAgent ? { 'user-agent': request.userAgent } : {},
    ...(request.payload ? { payload: request.payload } : {}),
  });
}

/** Logs `email` in as a device with `userAgent`; returns its `lk_session` (a 2FA account answers
 *  no session: use the login response directly then).
 *
 *  Example: `const phone = await logInAs(app, 'ana@mesa.com', 'senha', SAFARI_IPHONE)` */
export async function logInAs(
  app: FastifyInstance,
  email: string,
  password: string,
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36',
): Promise<string> {
  const response = await accountRequest(app, {
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
    userAgent,
  });
  return cookieOf(response, 'lk_session').value;
}
