import { z } from 'zod';
import { assetDto } from '../assets/asset.dto';
import { sceneVisibilityDto } from './library.dto';
export const LIBRARY_IMAGE_NAME_MAX_LENGTH = 60;
const imageNameDto = z.string().trim().min(1).max(LIBRARY_IMAGE_NAME_MAX_LENGTH);
export const libraryImageDto = z.strictObject({
  id: z.uuid(),
  name: imageNameDto,
  folderId: z.uuid().nullable(),
  visibility: sceneVisibilityDto,
  asset: assetDto,
  updatedAt: z.iso.datetime(),
});
export type LibraryImageDto = z.infer<typeof libraryImageDto>;
export const createLibraryImageRequestDto = z.strictObject({
  name: imageNameDto,
  assetId: z.uuid(),
  folderId: z.uuid().nullable().optional(),
  visibility: sceneVisibilityDto.optional(),
});
export type CreateLibraryImageRequestDto = z.infer<typeof createLibraryImageRequestDto>;
export const updateLibraryImageRequestDto = z
  .strictObject({
    name: imageNameDto.optional(),
    folderId: z.uuid().nullable().optional(),
    visibility: sceneVisibilityDto.optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'Expected at least one image change');
export type UpdateLibraryImageRequestDto = z.infer<typeof updateLibraryImageRequestDto>;
export const libraryImageParamsDto = z.strictObject({ campaignId: z.uuid(), imageId: z.uuid() });
