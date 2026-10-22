import type { UpdateMemberCardCommandDto } from '@lorkarium/contracts';
import type { ClockPort } from '../auth/clock.port';
import type { CampaignMembersDao } from '../campaigns/campaign-members.dao';
import { memberAccessOf } from '../campaigns/member-access';
import type { BoardPublisherPort } from '../scenes/board-publisher.port';
import { inLockedScene, type SceneLockDaos } from '../scenes/locked-scene';
import { MemberCardBo } from './member-card.bo';
import type { MemberCardsDao } from './member-cards.dao';
import { toMemberCardChangesPo, toMemberCardDto } from './member-cards.mapper';

export type UpdateMemberCard = Omit<UpdateMemberCardCommandDto, 'actionId' | 'campaignId'>;

export type MemberCardWriteDaos = SceneLockDaos &
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
 *  hears of it. The card is of the table, but the change bumps the active scene's version, like
 *  the condition list, so the board keeps one ordering of events.
 *
 *  Example: `await memberCards.update(user.id, campaignId, { memberId, changes: { armorClass: 15 } })` */
export class MemberCardsService {
  constructor(private readonly deps: MemberCardsServiceDeps) {}

  async update(userId: string, campaignId: string, command: UpdateMemberCard): Promise<number> {
    const access = await memberAccessOf(this.deps.members, campaignId, userId);
    const { memberId } = command;
    const saved = await inLockedScene(this.deps.transaction, campaignId, async ({ daos }) => {
      const isMember = (await daos.members.findMembership(campaignId, memberId)) !== undefined;
      new MemberCardBo(access, { memberId, isMember }).requireEdit();
      const changes = toMemberCardChangesPo(command.changes);
      return daos.memberCards.save(campaignId, memberId, changes);
    });
    const at = this.deps.clock.now().toISOString();
    const card = toMemberCardDto(saved.value);
    this.deps.publisher.memberCardChanged({ campaignId, version: saved.version, at, card });
    return saved.version;
  }
}
