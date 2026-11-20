import type { FastifyInstance } from 'fastify';
import type { HumanCheckConfig } from '../config/sign-up-env';
import { SkippedHumanCheck } from '../infrastructure/human-check/skipped-human-check';
import { TurnstileHumanCheck } from '../infrastructure/human-check/turnstile-human-check';
import type { HumanCheckPort } from '../modules/account-links/human-check.port';

/** The anti-bot check of `env.signUp.humanCheck`: Turnstile with the secret, or none without keys
 *  (only outside production; the env refuses production without them).
 *
 *  Example: `const humanCheck = deps.humanCheck ?? humanCheckOf(app, env.signUp.humanCheck)` */
export function humanCheckOf(
  app: FastifyInstance,
  config: HumanCheckConfig | null,
): HumanCheckPort {
  if (!config) return new SkippedHumanCheck();
  return new TurnstileHumanCheck({
    secretKey: config.secretKey,
    fetch: (url, init) => fetch(url, init),
    report: (failure) => app.log.warn({ humanCheck: failure }, 'a human check token did not pass'),
  });
}
