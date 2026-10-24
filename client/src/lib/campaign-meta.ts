import type { CampaignSummaryDto } from '@lorkarium/contracts';

/** "1 participante" / "N participantes".
 *
 *  Example: `memberCountLabel(4) // '4 participantes'` */
export function memberCountLabel(count: number): string {
  return count === 1 ? '1 participante' : `${count} participantes`;
}

/** The one-line meta of a campaign: system, the master (when it is not you) and members; the
 *  status has its own badge (`StatusBadge`).
 *
 *  Example: `campaignMeta(campaign) // 'Tormenta20 · mestre: Bia · 4 participantes'` */
export function campaignMeta(campaign: CampaignSummaryDto): string {
  const master = campaign.myRole !== 'master' ? `mestre: ${campaign.masterName}` : null;
  return [campaign.system, master, memberCountLabel(campaign.memberCount)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

export const ROLE_LABEL: Readonly<Record<CampaignSummaryDto['myRole'], string>> = {
  master: 'Mestre',
  player: 'Jogador',
  spectator: 'Espectador',
};
