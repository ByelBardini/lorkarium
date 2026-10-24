import type { MemberCardsDao } from '../../src/modules/member-cards/member-cards.dao';
import type {
  MemberCardChangesPo,
  MemberCardPo,
} from '../../src/modules/member-cards/member-cards.po';
import type { MemberCardTransactionRunner } from '../../src/modules/member-cards/member-cards.service';
import type { CampaignMembersDaoFake } from './campaigns-fakes';
import { memberCardPo } from './member-cards-factories';
import type { ScenesDaoFake } from './scenes-fakes';

/** In-memory member_cards; `save` patches the row (or creates it) and writes 'save' to the journal. */
export class MemberCardsDaoFake implements Pick<
  MemberCardsDao,
  'listOfCampaign' | 'findOfMember' | 'save'
> {
  constructor(
    private readonly journal: string[] = [],
    readonly rows: MemberCardPo[] = [],
  ) {}

  async listOfCampaign(campaignId: string): Promise<MemberCardPo[]> {
    return this.rows.filter((row) => row.campaignId === campaignId);
  }

  async findOfMember(campaignId: string, userId: string): Promise<MemberCardPo | undefined> {
    return this.rows.find((row) => row.campaignId === campaignId && row.userId === userId);
  }

  async save(
    campaignId: string,
    userId: string,
    changes: MemberCardChangesPo,
  ): Promise<MemberCardPo> {
    this.journal.push('save');
    const found = this.rows.find((row) => row.campaignId === campaignId && row.userId === userId);
    const row = found ?? memberCardPo({ campaignId, userId });
    if (!found) this.rows.push(row);
    Object.assign(row, changes);
    return { ...row };
  }
}

/** Runs the work on the fakes and writes 'commit' after it resolved, like the real transaction. */
export class MemberCardTransactionRunnerFake {
  constructor(
    private readonly scenes: ScenesDaoFake,
    private readonly members: CampaignMembersDaoFake,
    private readonly memberCards: MemberCardsDaoFake,
  ) {}

  readonly run: MemberCardTransactionRunner = async (work) => {
    const result = await work({
      scenes: this.scenes,
      members: this.members,
      memberCards: this.memberCards,
    });
    this.scenes.journal.push('commit');
    return result;
  };
}
