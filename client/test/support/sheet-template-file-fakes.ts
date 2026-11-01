import { SHEET_TEMPLATE_FILE_EXTENSION } from '@lorkarium/contracts';
import { sheetTemplateFileText, type SheetTemplateFileContent } from '@/lib/sheet-template-file';
import { tormentaTemplate } from './sheet-template-fixtures';

const FILE_NAME = `tormenta${SHEET_TEMPLATE_FILE_EXTENSION}`;

/** A picked `.lksheet` that only claims its `size` and counts how often its text was read,
 *  so a spec proves a file refused by size is never read.
 *
 *  Example: `const file = new ClaimedSizeFileFake(2 * 1024 * 1024 + 1); file.textReads // 0` */
export class ClaimedSizeFileFake extends File {
  textReads = 0;

  constructor(private readonly claimedSize: number) {
    super(['{}'], FILE_NAME);
  }

  override get size(): number {
    return this.claimedSize;
  }

  override text(): Promise<string> {
    this.textReads += 1;
    return super.text();
  }
}

/** The name and code of "Ficha Tormenta", as a `.lksheet` would carry them. */
export function tormentaFileContent(): SheetTemplateFileContent {
  const { name, html, css, js } = tormentaTemplate();
  return { name, html, css, js };
}

/** A `.lksheet` picked from the disk with the text given (a valid file of Tormenta by default).
 *
 *  Example: `await userEvent.upload(input, lksheetFile('{ broken'))` */
export function lksheetFile(text: string = sheetTemplateFileText(tormentaFileContent())): File {
  return new File([text], FILE_NAME);
}
