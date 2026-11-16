import {
  profileCardParamsDto,
  profileLookupParamsDto,
  type ProfileCardResponseDto,
} from '@lorkarium/contracts';
import type { FastifyInstance } from 'fastify';
import { perUserRateLimit } from '../../lib/per-user-rate-limit';
import type { ProfileCardService } from './profile-card.service';

const PROFILE_CARD_URL = '/users/:userId/card';
// Spec §8.4, keyed by the reader: a card is opened by a click, never in a loop.
const CARD_READS_PER_MINUTE = 60;
const PROFILE_LOOKUP_URL = '/users/by-username/:username/card';
// Tighter, on its own counter: a "does this @ exist?" answer is what an enumeration needs.
const LOOKUPS_PER_MINUTE = 30;

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

/** `GET /users/by-username/:username/card`: the same card behind an exact @ (with or without "@",
 *  any case). An e-mail fails the @ format (400), so the lookup never probes e-mails.
 *
 *  Example: `registerProfileLookupRoute(app, cards)` */
export function registerProfileLookupRoute(app: FastifyInstance, cards: ProfileCardService): void {
  const { requireAuth, userOf } = app.authGuards;
  const limit = perUserRateLimit(LOOKUPS_PER_MINUTE, '1 minute', userOf);
  const options = { preHandler: requireAuth, config: { rateLimit: limit } };
  app.get(PROFILE_LOOKUP_URL, options, async (r) => {
    const { username } = profileLookupParamsDto.parse(r.params);
    const card = await cards.cardByUsername(userOf(r).id, username);
    return { card } satisfies ProfileCardResponseDto;
  });
}
