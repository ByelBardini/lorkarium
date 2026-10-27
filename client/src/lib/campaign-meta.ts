import type { CampaignRoleDto, CampaignSummaryDto } from '@lorkarium/contracts';

/** What the meta line reads; `myRole: null` = not in the campaign (a public one). */
export type CampaignMetaSource = Pick<CampaignSummaryDto, 'system' | 'masterName' | 'memberCount'> &
  Readonly<{ myRole: CampaignRoleDto | null }>;

/** "1 participante" / "N participantes".
 *
 *  Example: `memberCountLabel(4) // '4 participantes'` */
export function memberCountLabel(count: number): string {
  return count === 1 ? '1 participante' : `${count} participantes`;
}

/** The one-line meta of a campaign: system, the master (when it is not you) and members; the
 *  status has its own badge (`StatusBadge`).
 *
 *  Example: `campaignMeta(campaign) // 'Tormenta20 · Mestre: Bia · 4 participantes'` */
export function campaignMeta(campaign: CampaignMetaSource): string {
  const master = campaign.myRole !== 'master' ? `Mestre: ${campaign.masterName}` : null;
  return [campaign.system, master, memberCountLabel(campaign.memberCount)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

export const ROLE_LABEL: Readonly<Record<CampaignSummaryDto['myRole'], string>> = {
  master: 'Mestre',
  player: 'Jogador',
  spectator: 'Espectador',
};
