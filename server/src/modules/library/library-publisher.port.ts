import type {
  LibraryChangedDto,
  LibraryMapChangedDto,
  LibraryMapRegionShownDto,
  SceneActivatedDto,
  ImagePresentationChangedDto,
} from '@lorkarium/contracts';

/** Tells the whole table, after the commit, that its library changed or that the group went to
 *  another grid; no grid data goes with either. */
export interface LibraryPublisherPort {
  imagePresentationChanged(event: ImagePresentationChangedDto): void;
  libraryChanged(event: LibraryChangedDto): void;
  libraryMapChanged(event: LibraryMapChangedDto): void;
  mapRegionShown(event: LibraryMapRegionShownDto): void;
  sceneActivated(event: SceneActivatedDto): void;
}
