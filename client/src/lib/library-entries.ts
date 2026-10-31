import type {
  DocumentSummaryDto,
  LibraryDto,
  LibraryImageDto,
  LibrarySceneDto,
} from '@lorkarium/contracts';

export type ImageEntry = LibraryImageDto & Readonly<{ kind: 'image' }>;
export type DocumentEntry = DocumentSummaryDto & Readonly<{ kind: 'document' }>;
export type LibraryEntry = LibrarySceneDto | ImageEntry | DocumentEntry;
export type MixedLibrary = LibraryDto &
  Readonly<{ images?: readonly LibraryImageDto[]; documents?: readonly DocumentSummaryDto[] }>;
export type LibraryTypeFilter = 'all' | 'grid' | 'image' | 'document';

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
  ];
}
