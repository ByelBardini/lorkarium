import type { CreateSheetTemplateRequestDto } from '@lorkarium/contracts';
import { STARTER_SHEET_SOURCE } from '@/features/sheets/sheet-template-starter';
import type { LibrarySubmit } from './use-library-submit';

export type SheetTemplateCreate = Readonly<{
  /** "Novo modelo de ficha": a template in `folderId` born with the starter code. */
  createSheetTemplate: (folderId: string | null) => void;
  /** A template with the code given (an imported file); resolves when the library was read again. */
  importSheetTemplate: (template: CreateSheetTemplateRequestDto) => Promise<void>;
}>;

/** The two ways a template is born in the library, both through the library's `submit`;
 *  `beforeCreate` runs first (the filter is cleared so the new template shows in the tree).
 *
 *  Example: `const { createSheetTemplate } = useSheetTemplateCreate(submit, () => resetFilter(view))` */
export function useSheetTemplateCreate(
  submit: LibrarySubmit,
  beforeCreate: () => void,
): SheetTemplateCreate {
  const importSheetTemplate = (template: CreateSheetTemplateRequestDto): Promise<void> => {
    beforeCreate();
    return submit({ intent: 'createSheetTemplate', template });
  };
  return {
    createSheetTemplate: (folderId) =>
      void importSheetTemplate({ folderId, ...STARTER_SHEET_SOURCE }),
    importSheetTemplate,
  };
}
