import { z } from 'zod';
import { assetDto } from '../assets/asset.dto';
export const imagePresentationDto = z.strictObject({
  id: z.uuid(),
  imageId: z.uuid(),
  name: z.string().trim().min(1).max(60),
  asset: assetDto,
});
export type ImagePresentationDto = z.infer<typeof imagePresentationDto>;
export const imagePresentationStateDto = z.strictObject({
  campaignId: z.uuid(),
  version: z.number().int().nonnegative(),
  at: z.iso.datetime(),
  presentation: imagePresentationDto.nullable(),
});
export type ImagePresentationStateDto = z.infer<typeof imagePresentationStateDto>;
export const imagePresentationChangedDto = imagePresentationStateDto.extend({ eventId: z.uuid() });
export type ImagePresentationChangedDto = z.infer<typeof imagePresentationChangedDto>;
export const libraryImagePresentationChangedDto = imagePresentationChangedDto;
export type LibraryImagePresentationChangedDto = ImagePresentationChangedDto;
