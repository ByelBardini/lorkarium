import { campaignStatusDto, type CampaignStatusDto } from '@lorkarium/contracts';

/** The statuses in the order a form offers them (the contract's order). */
export const CAMPAIGN_STATUSES: readonly CampaignStatusDto[] = campaignStatusDto.options;

export const CAMPAIGN_STATUS_LABEL: Readonly<Record<CampaignStatusDto, string>> = {
  building: 'Em construção',
  recruiting: 'Recrutando',
  ongoing: 'Em andamento',
  finished: 'Finalizada',
};

/** One line under the status choice: what the status tells the players. */
export const CAMPAIGN_STATUS_HINT: Readonly<Record<CampaignStatusDto, string>> = {
  building: 'O mestre ainda está preparando a mesa.',
  recruiting: 'A mesa procura jogadores.',
  ongoing: 'A campanha começou e o grupo está fechado.',
  finished: 'A campanha chegou ao fim.',
};

// Existing tokens only (design-system.md): the gold is the one accent, so only "ongoing" gets it.
const STATUS_TONE: Readonly<Record<CampaignStatusDto, string>> = {
  building: 'text-chart-2',
  recruiting: 'text-chart-4',
  ongoing: 'text-primary',
  finished: 'text-muted-foreground',
};

/** The text color class of a status: the dot takes it through `bg-current`.
 *
 *  Example: `statusToneClass('recruiting') // 'text-chart-4'` */
export function statusToneClass(status: CampaignStatusDto): string {
  return STATUS_TONE[status];
}
