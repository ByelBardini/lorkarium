import { z } from 'zod';
import { libraryDto } from './library.dto';
import { libraryImageDto } from './library-image.dto';
import { documentSummaryDto } from '../documents/document.dto';
import { sheetTemplateSummaryDto } from '../sheets/sheet-template.dto';
import { sheetSummaryDto } from '../sheets/sheet.dto';
export const campaignLibraryDto = libraryDto.extend({
  images: z.array(libraryImageDto),
  documents: z.array(documentSummaryDto),
  // Only masters receive it: the template code runs on every screen, so players never browse it.
  sheetTemplates: z.array(sheetTemplateSummaryDto).optional(),
  // A master gets every sheet; anyone else only those they read (none without a holder).
  sheets: z.array(sheetSummaryDto).optional(),
});
export type CampaignLibraryDto = z.infer<typeof campaignLibraryDto>;
