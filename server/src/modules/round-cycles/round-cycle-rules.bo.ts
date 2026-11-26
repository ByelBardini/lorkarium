import { ROUND_CYCLES_PER_TABLE_MAX } from '@lorkarium/game-core';
import { ForbiddenActionError } from '../campaigns/campaigns.error';
import { RoundCycleLimitError, RoundCycleMemberNotPlayerError } from './round-cycles.error';
import type { RoundCycleMemberWrite } from './round-cycles.dao';
import type { RoundCycleVisibilityValue } from './round-cycles.po';

/** Who looks at the cycles: a master (every cycle, its config), a member named in some cycle, or
 *  the rest of the table (nobody named: only the cycles everyone sees). */
export type CycleViewer =
  | Readonly<{ kind: 'master' }>
  | Readonly<{ kind: 'member'; userId: string }>
  | Readonly<{ kind: 'rest' }>;

/** What the rules read of a cycle: who it is shown to. */
export type CycleAudience = Readonly<{
  visibility: RoundCycleVisibilityValue;
  members: readonly RoundCycleMemberWrite[];
}>;

/** Who asks to choose, as the service knows them. */
export type CycleChooser = Readonly<{ campaignId: string; userId: string; isMaster: boolean }>;

type MemberIds = Readonly<{ seerIds: readonly string[]; chooserIds: readonly string[] }>;

/** The rules of the round cycles (spec §3.16): how many a table keeps, who sees and who chooses.
 *  Writing a cycle is the master's (`CampaignAccessBo.requireMaster`), checked before this.
 *
 *  Example: `new RoundCycleRulesBo().sees(cycle, { kind: 'member', userId })` */
export class RoundCycleRulesBo {
  /** Example: `rules.requireRoom(campaignId, await dao.countOfCampaign(campaignId))` */
  requireRoom(campaignId: string, current: number): void {
    if (current < ROUND_CYCLES_PER_TABLE_MAX) return;
    throw new RoundCycleLimitError(campaignId, ROUND_CYCLES_PER_TABLE_MAX);
  }

  /** The member rows of a cycle: who chooses also sees; each player once, in the order named.
   *
   *  Example: `rules.membersOf({ seerIds: [kael], chooserIds: [lyra] }, players)` */
  membersOf(ids: MemberIds, players: ReadonlySet<string>): RoundCycleMemberWrite[] {
    const named = [...new Set([...ids.chooserIds, ...ids.seerIds])];
    const outsider = named.find((userId) => !players.has(userId));
    if (outsider !== undefined) throw new RoundCycleMemberNotPlayerError(outsider);
    const ordered = [...new Set([...ids.seerIds, ...ids.chooserIds])];
    return ordered.map((userId) => ({
      userId,
      canSee: true,
      canChoose: ids.chooserIds.includes(userId),
    }));
  }

  /** Example: `rules.sees(cycle, { kind: 'rest' }) // only when everyone sees it` */
  sees(cycle: CycleAudience, viewer: CycleViewer): boolean {
    if (viewer.kind === 'master' || cycle.visibility === 'everyone') return true;
    if (viewer.kind === 'rest') return false;
    return cycle.members.some(({ userId, canSee }) => userId === viewer.userId && canSee);
  }

  /** Example: `rules.canChoose(cycle, { kind: 'master' }) // true` */
  canChoose(cycle: CycleAudience, viewer: CycleViewer): boolean {
    if (viewer.kind === 'master') return true;
    if (viewer.kind === 'rest') return false;
    return cycle.members.some(({ userId, canChoose }) => userId === viewer.userId && canChoose);
  }

  /** The master or a chooser of the cycle; anyone else gets FORBIDDEN citing who and the cycle.
   *
   *  Example: `rules.requireChooser(cycle, { campaignId, userId, isMaster: false }, cycleId)` */
  requireChooser(cycle: CycleAudience, who: CycleChooser, cycleId: string): void {
    const viewer: CycleViewer = who.isMaster
      ? { kind: 'master' }
      : { kind: 'member', userId: who.userId };
    if (this.canChoose(cycle, viewer)) return;
    throw new ForbiddenActionError(
      who.campaignId,
      who.userId,
      `choose the next phase of round cycle ${cycleId}`,
      'the master role or being a chooser of the cycle',
    );
  }
}
