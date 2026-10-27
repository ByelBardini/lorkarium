import type { CampaignSummaryDto } from '@lorkarium/contracts';

/** What the meta line reads (a summary, a detail or a public campaign). */
export type CampaignMetaSource = Pick<
  CampaignSummaryDto,
  'system' | 'ownerId' | 'masterName' | 'memberCount'
>;

/** "1 participante" / "N participantes".
 *
 *  Example: `memberCountLabel(4) // '4 participantes'` */
export function memberCountLabel(count: number): string {
  return count === 1 ? '1 participante' : `${count} participantes`;
}

/** The one-line meta of a campaign: system, the owner (`masterName`, unless the reader is the
 *  owner: a co-master still reads it) and members; the status has its own badge (`StatusBadge`).
 *  `readerId`: the signed-in account (`null` when unknown).
 *
 *  Example: `campaignMeta(campaign, user.id) // 'Tormenta20 · Mestre: Bia · 4 participantes'` */
export function campaignMeta(campaign: CampaignMetaSource, readerId: string | null): string {
  const master = campaign.ownerId !== readerId ? `Mestre: ${campaign.masterName}` : null;
  return [campaign.system, master, memberCountLabel(campaign.memberCount)]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

export const ROLE_LABEL: Readonly<Record<CampaignSummaryDto['myRole'], string>> = {
  master: 'Mestre',
  player: 'Jogador',
  spectator: 'Espectador',
};
