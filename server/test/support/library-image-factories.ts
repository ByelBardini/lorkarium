import type { LibraryImageRow } from '../../src/modules/library/library-images.dao';
import type { ImagePresentationPo } from '../../src/modules/library/image-presentations.po';
import { lyraPortraitPo } from './assets-factories';
import { VHARN_ID } from './campaigns-factories';

export const LIBRARY_PORTRAIT_ID = '66d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
export const PRESENTATION_ID = '77d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
const AT = new Date('2026-10-29T15:00:00Z');

/** A private library record and its file. Example: `libraryImageRow().image.name`. */
export function libraryImageRow(): LibraryImageRow {
  return {
    image: {
      id: LIBRARY_PORTRAIT_ID,
      campaignId: VHARN_ID,
      folderId: null,
      assetId: lyraPortraitPo().id,
      name: 'Retrato atual',
      visibility: 'private',
      createdAt: AT,
      updatedAt: AT,
    },
    asset: lyraPortraitPo({ purpose: 'library_image' }),
  };
}

/** The current presentation preserves the original name. Example: `imagePresentationPo().version`. */
export function imagePresentationPo(
  changes: Partial<ImagePresentationPo> = {},
): ImagePresentationPo {
  return {
    campaignId: VHARN_ID,
    version: 3,
    presentationId: PRESENTATION_ID,
    imageId: LIBRARY_PORTRAIT_ID,
    nameAtPresentation: 'Retrato ao mostrar',
    changedAt: AT,
    ...changes,
  };
}
