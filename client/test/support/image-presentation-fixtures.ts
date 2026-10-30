import type { ImagePresentationStateDto } from '@lorkarium/contracts';
import { VHARN } from './campaigns-api-fake';

export const PRESENTATION_ID = '3e908b3d-f134-4acc-bf42-c85b46e77800';
export const IMAGE_ID = '4e908b3d-f134-4acc-bf42-c85b46e77800';

/** A private portrait shown to the campaign. Example: `imagePresentation({ version: 3 })`. */
export function imagePresentation(
  overrides: Partial<ImagePresentationStateDto> = {},
): ImagePresentationStateDto {
  return {
    campaignId: VHARN.id,
    version: 1,
    at: '2026-10-29T12:00:00.000Z',
    presentation: {
      id: PRESENTATION_ID,
      imageId: IMAGE_ID,
      name: 'Retrato',
      asset: {
        id: '5e908b3d-f134-4acc-bf42-c85b46e77800',
        mimeType: 'image/png',
        width: 600,
        height: 900,
      },
    },
    ...overrides,
  };
}
