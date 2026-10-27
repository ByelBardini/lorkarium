import { hasOwnerPowers, type TableSeat } from '@lorkarium/game-core';
import type { CampaignAccessBo } from './campaign-access.bo';
import { CampaignNotOpenError, InvalidCampaignCoverError } from './campaigns.error';

/** What a settings save does to the campaign password. */
export type CampaignPasswordChange =
  | Readonly<{ kind: 'keep' }>
  | Readonly<{ kind: 'remove' }>
  | Readonly<{ kind: 'replace'; password: string }>;

/** The image a cover points at: its purpose, or `null` when no asset of this campaign has the id
 *  (another table's asset, or none at all). */
export type CoverImageCandidate = Readonly<{ assetId: string; purpose: string | null }>;

/** Whether the asker created the campaign or is an admin in juggernaut mode at it. */
export type OwnerPowersSeat = Pick<TableSeat, 'owner' | 'juggernaut'>;

/** The rules of the campaign settings (edit, new join code, delete): any master edits and hands
 *  out a code, only owner powers delete, always with the table open; the password
 *  kept/removed/replaced, and an image cover only from this table's cover assets. `atTable` = the
 *  asker has the table open in a live connection, as the service read it from the presence.
 *
 *  Example: `new CampaignSettingsBo(access, true, { owner: true, juggernaut: false }).requireOwnerPowersAtTable('delete the campaign')` */
export class CampaignSettingsBo {
  constructor(
    private readonly access: CampaignAccessBo,
    private readonly atTable: boolean,
    private readonly powers: OwnerPowersSeat,
  ) {}

  /** A non-member gets CAMPAIGN_NOT_FOUND, a player FORBIDDEN, the master away from the table
   *  CAMPAIGN_NOT_OPEN, each citing the table and who asked.
   *
   *  Example: `new CampaignSettingsBo(masterAccess, false).requireMasterAtTable('delete the campaign') // throws CAMPAIGN_NOT_OPEN` */
  requireMasterAtTable(action: string): void {
    this.access.requireMaster(action);
    this.requireAtTable(action);
  }

  /** As `requireMasterAtTable`, and a co-master (a master without owner powers) gets FORBIDDEN
   *  citing "owner powers" before the table is looked at.
   *
   *  Example: `coMasterSettings.requireOwnerPowersAtTable('delete the campaign') // throws FORBIDDEN` */
  requireOwnerPowersAtTable(action: string): void {
    this.access.requireMaster(action);
    if (!hasOwnerPowers({ role: 'master', ...this.powers })) {
      this.access.forbid(action, 'owner powers');
    }
    this.requireAtTable(action);
  }

  private requireAtTable(action: string): void {
    if (this.atTable) return;
    throw new CampaignNotOpenError(this.access.campaignIdOf(), this.access.userIdOf(), action);
  }

  /** `undefined` keeps the password, `null` removes it, a text replaces it.
   *
   *  Example: `settings.passwordChange(null) // { kind: 'remove' }` */
  passwordChange(password: string | null | undefined): CampaignPasswordChange {
    if (password === undefined) return { kind: 'keep' };
    if (password === null) return { kind: 'remove' };
    return { kind: 'replace', password };
  }

  /** Refuses with INVALID_BODY an image that is not a cover sent to this campaign.
   *
   *  Example: `settings.requireCoverImage({ assetId, purpose: 'token' }) // throws INVALID_BODY` */
  requireCoverImage(candidate: CoverImageCandidate): void {
    if (candidate.purpose === 'cover') return;
    const campaignId = this.access.campaignIdOf();
    throw new InvalidCampaignCoverError(campaignId, candidate.assetId, candidate.purpose);
  }
}
