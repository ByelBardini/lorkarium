import { z } from 'zod';
import { memberColorDto } from '../account/username.dto';
import { userPlanDto } from '../plans/user-plan.dto';
import { reputationSummaryDto } from './reputation.dto';

/** Presence on the card: only for friends (`null` otherwise); invisible reads as `offline`. */
export const profileCardPresenceDto = z.enum(['online', 'offline']).nullable();
export type ProfileCardPresence = z.infer<typeof profileCardPresenceDto>;

/** The reader's relation to the account. `blocked` is only the reader blocking the other: being
 *  blocked by them reads as `none`, so the block is never revealed. */
export const PROFILE_CARD_RELATIONS = [
  'self',
  'friend',
  'outgoing',
  'incoming',
  'blocked',
  'none',
] as const;
export const profileCardRelationDto = z.enum(PROFILE_CARD_RELATIONS);
export type ProfileCardRelation = z.infer<typeof profileCardRelationDto>;

/** A table both accounts take part in as master or player. */
export const mutualCampaignDto = z.strictObject({ id: z.uuid(), name: z.string() });
export type MutualCampaignDto = z.infer<typeof mutualCampaignDto>;

const countDto = z.int().nonnegative();

/** Another account's public card (`GET /api/users/:userId/card`): never the e-mail. `bannerId`
 *  is `null` without a paid plan; `color` is only the banner background. `plan`, `admin` and
 *  `lorkariumOwner` pick the seal.
 *
 *  Example: `profileCardDto.parse(body.card).reputation.percent // null` */
export const profileCardDto = z.strictObject({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  color: memberColorDto,
  avatarId: z.uuid().nullable(),
  bannerId: z.uuid().nullable(),
  bio: z.string().nullable(),
  memberSince: z.iso.datetime(),
  plan: userPlanDto,
  admin: z.boolean(),
  lorkariumOwner: z.boolean(),
  presence: profileCardPresenceDto,
  relation: profileCardRelationDto,
  rollsCount: countDto,
  natural20Count: countDto,
  campaignsAsMaster: countDto,
  campaignsAsPlayer: countDto,
  reputation: reputationSummaryDto,
  gameSystems: z.string().nullable(),
  playSchedule: z.string().nullable(),
  contact: z.string().nullable(),
  mutualCampaigns: z.array(mutualCampaignDto),
  mutualFriends: countDto,
});
export type ProfileCardDto = z.infer<typeof profileCardDto>;

/** Response of `GET /api/users/:userId/card`. */
export const profileCardResponseDto = z.strictObject({ card: profileCardDto });
export type ProfileCardResponseDto = z.infer<typeof profileCardResponseDto>;

/** Params of the routes about another account (card, reputation, report). */
export const profileCardParamsDto = z.strictObject({ userId: z.uuid() });
export type ProfileCardParamsDto = z.infer<typeof profileCardParamsDto>;
