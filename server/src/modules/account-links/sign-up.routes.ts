import { signUpRequestDto, type SignUpSettingsDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { SignUpService } from './sign-up.service';

// The public forms that send e-mail (sign-up, forgotten password): a person needs a couple of
// tries; a script needs thousands.
const FORM_REQUESTS_PER_10_MINUTES = 5;

/** The route options of a public form that mails someone: 5 per 10 minutes per IP.
 *
 *  Example: `app.post('/sign-up', mailingFormOptions(), handler)` */
export function mailingFormOptions(): object {
  const rateLimit = { max: FORM_REQUESTS_PER_10_MINUTES, timeWindow: '10 minutes' };
  return { config: { rateLimit } };
}

/** Public on purpose: whoever signs up has no account. The answer is 202 with no body for every
 *  address (new, taken, banned, repeated); the IP goes to the anti-bot check. Registered inside
 *  `accountLinksRoutes`, which owns the limiter and the error handler.
 *
 *  Example: `registerSignUpRoutes(app, signUp, { registrationOpen: false, humanCheckSiteKey: null })` */
export function registerSignUpRoutes(
  app: FastifyInstance,
  service: SignUpService,
  settings: SignUpSettingsDto,
): void {
  app.get('/sign-up/settings', async () => settings satisfies SignUpSettingsDto);
  app.post('/sign-up', mailingFormOptions(), async (request, reply) => {
    const input = signUpRequestDto.parse(request.body);
    await service.request(input, request.ip);
    return reply.code(202).send();
  });
}
