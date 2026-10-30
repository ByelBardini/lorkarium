import { z } from 'zod';
import { libraryDto } from './library.dto';
import { libraryImageDto } from './library-image.dto';
export const campaignLibraryDto = libraryDto.extend({ images: z.array(libraryImageDto) });
export type CampaignLibraryDto = z.infer<typeof campaignLibraryDto>;
