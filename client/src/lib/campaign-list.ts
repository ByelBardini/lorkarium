import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { searchText } from '@/lib/search-text';

/** The campaigns whose name or system contains the query, ignoring accents and case.
 *
 *  Example: `filterCampaigns(campaigns, 'pantano') // [Contrato no Pântano]` */
export function filterCampaigns(
  campaigns: readonly CampaignSummaryDto[],
  query: string,
): CampaignSummaryDto[] {
  const needle = searchText(query.trim());
  if (!needle) return [...campaigns];
  return campaigns.filter((campaign) =>
    [campaign.name, campaign.system ?? ''].some((text) => searchText(text).includes(needle)),
  );
}

/** The campaign of the "Continuar" band: the one entered most recently, or `null` if none was.
 *
 *  Example: `continueCandidate(campaigns)?.name` */
export function continueCandidate(
  campaigns: readonly CampaignSummaryDto[],
): CampaignSummaryDto | null {
  let latest: CampaignSummaryDto | null = null;
  for (const campaign of campaigns) {
    if (!campaign.lastEnteredAt) continue;
    if (!latest?.lastEnteredAt || campaign.lastEnteredAt > latest.lastEnteredAt) latest = campaign;
  }
  return latest;
}
