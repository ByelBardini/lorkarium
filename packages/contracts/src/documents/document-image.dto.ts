import { z } from 'zod';
import { assetLinkDto, assetResponseDto } from '../assets/asset.dto';

export const importDocumentImageRequestDto = z.strictObject({ url: assetLinkDto });
export type ImportDocumentImageRequestDto = z.infer<typeof importDocumentImageRequestDto>;
export const documentImageFromLibraryRequestDto = z.strictObject({ imageId: z.uuid() });
export type DocumentImageFromLibraryRequestDto = z.infer<typeof documentImageFromLibraryRequestDto>;
export const documentImageResponseDto = assetResponseDto;
