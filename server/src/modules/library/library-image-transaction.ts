import { CampaignNotFoundError } from '../campaigns/campaigns.error';
import { viewerAccessOf } from '../campaigns/member-access';
import type { LibraryRequester } from './library.service';
import type { LibraryImageDaos, LibraryImageServiceDeps } from './library-image.service';
export async function editLibraryImages<T>(
  deps: LibraryImageServiceDeps,
  requester: LibraryRequester,
  work: (daos: LibraryImageDaos) => Promise<T>,
): Promise<T> {
  const access = await viewerAccessOf(deps.read.members, requester.campaignId, requester.userId);
  access.requireMaster('edit library images');
  return deps.transaction(async (daos) => {
    const campaign = await daos.campaigns.lockById(requester.campaignId);
    if (!campaign) throw new CampaignNotFoundError(requester);
    return work(daos);
  });
}
