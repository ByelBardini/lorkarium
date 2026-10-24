import {
  accountRecoveryRequestDto,
  accountRecoveryTokenDto,
  type AccountRecoveryCheckResponseDto,
} from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import type { AccountRecoveryService } from './account-recovery.service';

// Spec §8.4: public routes, so per IP, like the e-mail confirmation.
const RECOVERY_ATTEMPTS_PER_MINUTE = 10;

/** The public routes of the "Não fui eu" link: what it will do, and doing it with a new password.
 *  Registered in the context of `accountSecurityRoutes`, whose limiter and error handler they use.
 *
 *  Example: `registerAccountRecoveryRoutes(app, accountRecoveryService)` */
export function registerAccountRecoveryRoutes(
  app: FastifyInstance,
  service: AccountRecoveryService,
): void {
  const options = {
    config: { rateLimit: { max: RECOVERY_ATTEMPTS_PER_MINUTE, timeWindow: '1 minute' } },
  };
  app.post('/account/recovery/check', options, async (request) => {
    const recovery = await service.check(accountRecoveryTokenDto.parse(request.body).token);
    return { recovery } satisfies AccountRecoveryCheckResponseDto;
  });
  app.post('/account/recovery', options, async (request, reply) => {
    const input = accountRecoveryRequestDto.parse(request.body);
    await service.recover(input.token, input.newPassword);
    // Every session of the account is gone, this browser's included.
    app.authGuards.clearSessionCookie(reply);
    return reply.code(204).send();
  });
}
