import {
  twoFactorConfirmRequestDto,
  twoFactorEnableRequestDto,
  twoFactorSetupRequestDto,
  type RecoveryCodesResponseDto,
  type TwoFactorSetupResponseDto,
} from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import type { AccountTwoFactorService } from './account-two-factor.service';

// Spec §8.4 and the 2FA practice: a handful of codes a minute per user, each route on its own.
const TWO_FACTOR_ATTEMPTS_PER_MINUTE = 5;

/** The 2FA routes of the account: setup, enable, disable and new recovery codes. Registered in the
 *  same context as `accountSecurityRoutes`, whose limiter and error handler they rely on.
 *
 *  Example: `registerTwoFactorRoutes(app, accountTwoFactorService)` */
export function registerTwoFactorRoutes(
  app: FastifyInstance,
  service: AccountTwoFactorService,
): void {
  const { requireAuth, userOf } = app.authGuards;
  const limit = perUserRateLimit(TWO_FACTOR_ATTEMPTS_PER_MINUTE, '1 minute', userOf);
  const options = { preHandler: requireAuth, config: { rateLimit: limit } };
  app.post('/account/two-factor/setup', options, async (request) => {
    const input = twoFactorSetupRequestDto.parse(request.body);
    const setup = await service.setup(userOf(request).id, input.currentPassword);
    return setup satisfies TwoFactorSetupResponseDto;
  });
  app.post('/account/two-factor/enable', options, async (request) => {
    const input = twoFactorEnableRequestDto.parse(request.body);
    const userAgent = request.headers['user-agent'] ?? null;
    const recoveryCodes = await service.enable(userOf(request).id, input.code, userAgent);
    return { recoveryCodes } satisfies RecoveryCodesResponseDto;
  });
  app.post('/account/two-factor/disable', options, async (request, reply) => {
    const input = twoFactorConfirmRequestDto.parse(request.body);
    await service.disable(userOf(request).id, input, request.headers['user-agent'] ?? null);
    return reply.code(204).send();
  });
  app.post('/account/two-factor/recovery-codes', options, async (request) => {
    const input = twoFactorConfirmRequestDto.parse(request.body);
    const recoveryCodes = await service.regenerateCodes(userOf(request).id, input);
    return { recoveryCodes } satisfies RecoveryCodesResponseDto;
  });
}
