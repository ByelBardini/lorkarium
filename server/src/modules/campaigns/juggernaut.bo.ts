import type { TableSeat } from '@lorkarium/game-core';
import type { CampaignRole } from './campaign-access.bo';
import { AlreadyOwnerError, CampaignNotFoundError } from './campaigns.error';

/** Where the admin sits at the table and the role they go back to when the mode ends (`null` =
 *  they were not a member before turning it on). */
export type JuggernautSeat = TableSeat & Readonly<{ roleBefore: CampaignRole | null }>;

export type JuggernautStart =
  | Readonly<{ change: 'started'; roleBefore: CampaignRole | null }>
  | Readonly<{ change: 'unchanged' }>;

export type JuggernautEnding =
  | Readonly<{ change: 'ended'; restore: CampaignRole | null }>
  | Readonly<{ change: 'unchanged'; role: CampaignRole }>;

/** When an admin turns juggernaut mode on and off at one table (the route checks the admin
 *  role): on from any seat but the owner's, which already has every power; off back to the role
 *  before, or out of the table when there was none. `seat` is `null` for a non-member.
 *
 *  Example: `new JuggernautBo(campaignId, rootId, null).start() // { change: 'started', roleBefore: null }` */
export class JuggernautBo {
  constructor(
    private readonly campaignId: string,
    private readonly userId: string,
    private readonly seat: JuggernautSeat | null,
  ) {}

  /** `started` with the role to keep, `unchanged` when already on; the owner gets ALREADY_OWNER.
   *
   *  Example: `bo.start() // { change: 'started', roleBefore: 'player' }` */
  start(): JuggernautStart {
    if (this.seat?.owner) throw new AlreadyOwnerError(this.campaignId, this.userId);
    if (this.seat?.juggernaut) return { change: 'unchanged' };
    return { change: 'started', roleBefore: this.seat?.role ?? null };
  }

  /** `ended` with the role to restore (`null` = leave the table), `unchanged` with the role kept
   *  when the mode is off; a non-member gets CAMPAIGN_NOT_FOUND.
   *
   *  Example: `bo.end() // { change: 'ended', restore: null }` */
  end(): JuggernautEnding {
    const { campaignId, userId, seat } = this;
    if (!seat) throw new CampaignNotFoundError({ campaignId, userId });
    if (!seat.juggernaut) return { change: 'unchanged', role: seat.role };
    return { change: 'ended', restore: seat.roleBefore };
  }
}
