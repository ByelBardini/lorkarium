import type {
  DocumentSummaryDto,
  LibraryDto,
  LibraryImageDto,
  LibrarySceneDto,
  SheetSummaryDto,
  SheetTemplateSummaryDto,
} from '@lorkarium/contracts';

export type ImageEntry = LibraryImageDto & Readonly<{ kind: 'image' }>;
export type DocumentEntry = DocumentSummaryDto & Readonly<{ kind: 'document' }>;
// A template is the masters' only: it sits in the tree as a private item.
export type SheetTemplateEntry = SheetTemplateSummaryDto &
  Readonly<{ kind: 'sheet-template'; visibility: 'private' }>;
// A sheet the whole table reads is public; one only its holder (or only the masters) reads is
// private, for the visibility filter. `holderLabel` is the line the tree says about its holder.
export type SheetEntry = Omit<SheetSummaryDto, 'visibility'> &
  Readonly<{
    kind: 'sheet';
    visibility: 'public' | 'private';
    sheetVisibility: SheetSummaryDto['visibility'];
    holderLabel: string;
  }>;
export type LibraryEntry =
  LibrarySceneDto | ImageEntry | DocumentEntry | SheetTemplateEntry | SheetEntry;
export type MixedLibrary = LibraryDto &
  Readonly<{
    images?: readonly LibraryImageDto[];
    documents?: readonly DocumentSummaryDto[];
    sheetTemplates?: readonly SheetTemplateSummaryDto[];
    sheets?: readonly SheetSummaryDto[];
  }>;
export type LibraryTypeFilter = 'all' | 'grid' | 'image' | 'document' | 'sheet-template' | 'sheet';

/** The tree's line about who holds a sheet. Example: `(sheet) => sheetHolderLabel(sheet, names)` */
export type SheetHolderLabeler = (sheet: SheetSummaryDto) => string;

const SHEET_TEMPLATE_KEY_PREFIX = 'sheet-template:';

/** The tree item of a sheet template. Example: `sheetTemplateKey(template.id)`. */
export function sheetTemplateKey(id: string): string {
  return `${SHEET_TEMPLATE_KEY_PREFIX}${id}`;
}

/** Reads a sheet template selection. Example: `sheetTemplateIdOf('sheet-template:t1') // 't1'`. */
export function sheetTemplateIdOf(key: string | null): string | null {
  return key?.startsWith(SHEET_TEMPLATE_KEY_PREFIX)
    ? key.slice(SHEET_TEMPLATE_KEY_PREFIX.length)
    : null;
}

const SHEET_KEY_PREFIX = 'sheet:';

/** The tree item of a sheet. Example: `sheetKey(sheet.id) // 'sheet:<id>'`. */
export function sheetKey(id: string): string {
  return `${SHEET_KEY_PREFIX}${id}`;
}

/** Reads a sheet selection. Example: `sheetIdOf('sheet:s1') // 's1'`. */
export function sheetIdOf(key: string | null): string | null {
  return key?.startsWith(SHEET_KEY_PREFIX) ? key.slice(SHEET_KEY_PREFIX.length) : null;
}

/** Separates document identities from other items. Example: documentKey(document.id). */
export function documentKey(id: string): string {
  return `document:${id}`;
}

/** Reads a document selection. Example: documentIdOf('document:letter'). */
export function documentIdOf(key: string | null): string | null {
  return key?.startsWith('document:') ? key.slice(9) : null;
}

/** Keeps image identities separate from grid identities. Example: `imageKey(image.id)`. */
export function imageKey(id: string): string {
  return `image:${id}`;
}

/** Reads an image selection. Example: `imageIdOf('image:portrait') // 'portrait'`. */
export function imageIdOf(key: string | null): string | null {
  return key?.startsWith('image:') ? key.slice(6) : null;
}

/** Adapts mixed media to the existing structural tree. Example: `libraryEntries(library, 'image')`. */
export function libraryEntries(
  library: MixedLibrary,
  type: LibraryTypeFilter = 'all',
  holderLabel: SheetHolderLabeler = () => 'Ficha',
): LibraryEntry[] {
  const images: ImageEntry[] = (library.images ?? []).map((image) => ({
    ...image,
    id: imageKey(image.id),
    kind: 'image',
  }));
  const documents: DocumentEntry[] = (library.documents ?? []).map((document) => ({
    ...document,
    id: documentKey(document.id),
    kind: 'document',
  }));
  return [
    ...(type === 'all' || type === 'grid' ? library.scenes : []),
    ...(type === 'all' || type === 'image' ? images : []),
    ...(type === 'all' || type === 'document' ? documents : []),
    ...(type === 'all' || type === 'sheet-template' ? templateEntries(library) : []),
    ...(type === 'all' || type === 'sheet' ? sheetEntries(library, holderLabel) : []),
  ];
}

function sheetEntries(library: MixedLibrary, holderLabel: SheetHolderLabeler): SheetEntry[] {
  return (library.sheets ?? []).map((sheet) => ({
    ...sheet,
    id: sheetKey(sheet.id),
    kind: 'sheet',
    visibility: sheet.tokenId !== null && sheet.visibility === 'table' ? 'public' : 'private',
    sheetVisibility: sheet.visibility,
    holderLabel: holderLabel(sheet),
  }));
}

function templateEntries(library: MixedLibrary): SheetTemplateEntry[] {
  return (library.sheetTemplates ?? []).map((template) => ({
    ...template,
    id: sheetTemplateKey(template.id),
    kind: 'sheet-template',
    visibility: 'private',
  }));
}
