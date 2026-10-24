import type { UpdateMemberCardCommandDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { inLockedCast, type CastOnlyLockDaos } from '../scenes/locked-cast';
import { gridEventBase } from '../scenes/locked-scene';
import { MemberCardBo } from './member-card.bo';
import type { MemberCardsDao } from './member-cards.dao';
import { toMemberCardChangesPo, toMemberCardDto } from './member-cards.mapper';

export type UpdateMemberCard = Omit<UpdateMemberCardCommandDto, 'actionId' | 'campaignId'>;

export type MemberCardWriteDaos = CastOnlyLockDaos &
  Readonly<{
    members: Pick<CampaignMembersDao, 'findMembership'>;
    memberCards: Pick<MemberCardsDao, 'save'>;
  }>;

export type MemberCardTransactionRunner = <T>(
  work: (daos: MemberCardWriteDaos) => Promise<T>,
) => Promise<T>;

export type MemberCardsServiceDeps = Readonly<{
  members: Pick<CampaignMembersDao, 'findMembership'>;
  transaction: MemberCardTransactionRunner;
  publisher: BoardPublisherPort;
  clock: ClockPort;
}>;

/** The party board card of each member: the member and the masters edit it, the whole table
 *  hears of it. The card is of the table, not of a grid: the change bumps the cast's version and
 *  goes to its rooms (every member's), so activating another grid never loses it.
 *
 *  Example: `await memberCards.update(user.id, campaignId, { memberId, changes: { armorClass: 15 } })` */
export class MemberCardsService {
  constructor(private readonly deps: MemberCardsServiceDeps) {}

  async update(userId: string, campaignId: string, command: UpdateMemberCard): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const { memberId } = command;
    // The card is the table's: it stays on the cast whatever grid the command names.
    const saved = await inLockedCast(this.deps.transaction, campaignId, async ({ daos }) => {
      const isMember = (await daos.members.findMembership(campaignId, memberId)) !== undefined;
      new MemberCardBo(access, { memberId, isMember }).requireEdit();
      const changes = toMemberCardChangesPo(command.changes);
      return { value: await daos.memberCards.save(campaignId, memberId, changes), changed: true };
    });
    const card = toMemberCardDto(saved.value);
    this.deps.publisher.memberCardChanged({
      ...gridEventBase(campaignId, saved, this.deps.clock),
      card,
    });
    return saved.version;
  }
}
