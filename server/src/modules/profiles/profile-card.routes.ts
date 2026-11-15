import { profileCardParamsDto, type ProfileCardResponseDto } from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import type { ProfileCardService } from './profile-card.service';

const PROFILE_CARD_URL = '/users/:userId/card';
// Spec §8.4, keyed by the reader: a card is opened by a click, never in a loop.
const CARD_READS_PER_MINUTE = 60;

/** `GET /users/:userId/card`, inside the profiles plugin (its rate limit and error handler). The
 *  reader is the session's account.
 *
 *  Example: `registerProfileCardRoute(app, cards)` */
export function registerProfileCardRoute(app: FastifyInstance, cards: ProfileCardService): void {
  const { requireAuth, userOf } = app.authGuards;
  const limit = perUserRateLimit(CARD_READS_PER_MINUTE, '1 minute', userOf);
  app.get(
    PROFILE_CARD_URL,
    { preHandler: requireAuth, config: { rateLimit: limit } },
    async (r) => {
      const { userId } = profileCardParamsDto.parse(r.params);
      return { card: await cards.cardOf(userOf(r).id, userId) } satisfies ProfileCardResponseDto;
    },
  );
}
