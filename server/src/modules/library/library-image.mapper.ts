import type { LibraryImageDto, ImagePresentationStateDto } from '@lorkarium/contracts';
import { toAssetDto } from '../assets/assets.mapper';
import type { LibraryImageRow } from './library-images.dao';
import type { ImagePresentationPo } from './image-presentations.po';
export function toLibraryImageDto({ image, asset }: LibraryImageRow): LibraryImageDto {
  return {
    id: image.id,
    name: image.name,
    folderId: image.folderId,
    visibility: image.visibility,
    asset: toAssetDto(asset),
    updatedAt: image.updatedAt.toISOString(),
  };
}
export function toImagePresentationState(
  campaignId: string,
  row: ImagePresentationPo | undefined,
  image: LibraryImageRow | undefined,
): ImagePresentationStateDto {
  const presentation =
    row?.presentationId && image
      ? {
          id: row.presentationId,
          imageId: image.image.id,
          name: row.nameAtPresentation ?? image.image.name,
          asset: toAssetDto(image.asset),
        }
      : null;
  return {
    campaignId,
    version: row?.version ?? 0,
    at: row?.changedAt.toISOString() ?? new Date(0).toISOString(),
    presentation,
  };
}
