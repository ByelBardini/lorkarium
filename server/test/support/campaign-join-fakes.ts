import type {
  CampaignJoinTransactionRunner,
  CampaignJoinWriteDaos,
} from '../../src/modules/campaigns/campaign-join.service';
import type { CampaignMembersDaoFake, CampaignsDaoFake } from './campaigns-fakes';

/** Runs the seat's work on the campaigns and members fakes and counts each run (`runs`), like
 *  the real transaction of a join.
 *
 *  Example: `new CampaignJoinTransactionRunnerFake(campaigns, members).run` */
export class CampaignJoinTransactionRunnerFake {
  runs = 0;

  constructor(
    private readonly campaigns: CampaignsDaoFake,
    private readonly members: CampaignMembersDaoFake,
  ) {}

  readonly run: CampaignJoinTransactionRunner = async <T>(
    work: (daos: CampaignJoinWriteDaos) => Promise<T>,
  ): Promise<T> => {
    this.runs += 1;
    return work({ campaigns: this.campaigns, members: this.members });
  };
}
