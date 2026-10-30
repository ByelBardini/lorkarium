import type { ImagePresentationStateDto } from '@lorkarium/contracts';
import { viewerAccessOf } from '../campaigns/member-access';
import { newImagePresentation } from './image-presentation.bo';
import { toImagePresentationState } from './library-image.mapper';
import { LibraryImageNotFoundError } from './library-image.error';
import { editLibraryImages } from './library-image-transaction';
import type { LibraryImageServiceDeps } from './library-image.service';
import type { LibraryRequester } from './library.service';
export class ImagePresentationService {
  constructor(private readonly deps: LibraryImageServiceDeps) {}
  async snapshot(requester: LibraryRequester): Promise<ImagePresentationStateDto> {
    return this.deps.snapshot(async (daos) => {
      await viewerAccessOf(daos.members, requester.campaignId, requester.userId);
      const row = await daos.presentations.findOfCampaign(requester.campaignId);
      const image = row?.imageId
        ? await daos.images.findInCampaign(requester.campaignId, row.imageId)
        : undefined;
      return toImagePresentationState(requester.campaignId, row, image);
    });
  }
  async present(requester: LibraryRequester, imageId: string): Promise<ImagePresentationStateDto> {
    const state = await editLibraryImages(this.deps, requester, async (daos) => {
      const image = await daos.images.findInCampaign(requester.campaignId, imageId);
      if (!image) throw new LibraryImageNotFoundError(requester.campaignId, imageId);
      const change = newImagePresentation(image.image, this.deps.newId());
      const row = await daos.presentations.save(
        requester.campaignId,
        change,
        this.deps.clock.now(),
      );
      return toImagePresentationState(requester.campaignId, row, image);
    });
    this.deps.publisher.imagePresentationChanged({ ...state, eventId: this.deps.newId() });
    return state;
  }
}
