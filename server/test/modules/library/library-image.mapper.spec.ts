import { describe, expect, it } from 'vitest';
import {
  toImagePresentationState,
  toLibraryImageDto,
} from '../../../src/modules/library/library-image.mapper';
import { VHARN_ID } from '../../support/campaigns-factories';
import {
  imagePresentationPo,
  libraryImageRow,
  LIBRARY_PORTRAIT_ID,
  PRESENTATION_ID,
} from '../../support/library-image-factories';

describe('library image mappers', () => {
  it('a library record exposes only public metadata and its sanitized asset', () => {
    expect(toLibraryImageDto(libraryImageRow())).toEqual({
      id: LIBRARY_PORTRAIT_ID,
      name: 'Retrato atual',
      folderId: null,
      visibility: 'private',
      asset: { id: libraryImageRow().asset.id, mimeType: 'image/png', width: 400, height: 400 },
      updatedAt: '2026-10-29T15:00:00.000Z',
    });
  });

  it('a campaign without a presentation starts at version zero with no image', () => {
    expect(toImagePresentationState(VHARN_ID, undefined, undefined)).toEqual({
      campaignId: VHARN_ID,
      version: 0,
      at: '1970-01-01T00:00:00.000Z',
      presentation: null,
    });
  });

  it('a renamed image keeps the name captured at presentation and hides its folder and visibility', () => {
    expect(toImagePresentationState(VHARN_ID, imagePresentationPo(), libraryImageRow())).toEqual({
      campaignId: VHARN_ID,
      version: 3,
      at: '2026-10-29T15:00:00.000Z',
      presentation: {
        id: PRESENTATION_ID,
        imageId: LIBRARY_PORTRAIT_ID,
        name: 'Retrato ao mostrar',
        asset: { id: libraryImageRow().asset.id, mimeType: 'image/png', width: 400, height: 400 },
      },
    });
  });

  it('a cleared presentation keeps its version and timestamp without any image metadata', () => {
    const cleared = imagePresentationPo({
      version: 4,
      presentationId: null,
      imageId: null,
      nameAtPresentation: null,
    });
    expect(toImagePresentationState(VHARN_ID, cleared, undefined)).toEqual({
      campaignId: VHARN_ID,
      version: 4,
      at: '2026-10-29T15:00:00.000Z',
      presentation: null,
    });
  });
});
