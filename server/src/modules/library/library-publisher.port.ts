import type { LibraryChangedDto, SceneActivatedDto } from '@lorkarium/contracts';

/** Tells the whole table, after the commit, that its library changed or that the group went to
 *  another grid; no grid data goes with either. */
export interface LibraryPublisherPort {
  libraryChanged(event: LibraryChangedDto): void;
  sceneActivated(event: SceneActivatedDto): void;
}
