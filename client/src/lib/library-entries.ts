import type { LibraryDto, LibraryImageDto, LibrarySceneDto } from '@lorkarium/contracts';

export type ImageEntry = LibraryImageDto & Readonly<{ kind: 'image' }>;
export type LibraryEntry = LibrarySceneDto | ImageEntry;
export type MixedLibrary = LibraryDto & Readonly<{ images?: readonly LibraryImageDto[] }>;
export type LibraryTypeFilter = 'all' | 'grid' | 'image';

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
  return [...(type === 'image' ? [] : library.scenes), ...(type === 'grid' ? [] : images)];
}
