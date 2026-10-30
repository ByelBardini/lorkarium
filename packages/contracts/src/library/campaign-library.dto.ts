import { z } from 'zod';
import { libraryDto } from './library.dto';
import { libraryImageDto } from './library-image.dto';
import { documentSummaryDto } from '../documents/document.dto';
export const campaignLibraryDto = libraryDto.extend({
  images: z.array(libraryImageDto),
  documents: z.array(documentSummaryDto),
});
export type CampaignLibraryDto = z.infer<typeof campaignLibraryDto>;
