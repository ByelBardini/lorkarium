import type { BadgeDto } from '@lorkarium/contracts';

/** The badges an account shows (only those with an image), in catalog order. The badges module's
 *  `BadgesService` keeps the promise. */
export interface AccountBadgesPort {
  badgesOf(userId: string): Promise<BadgeDto[]>;
}
