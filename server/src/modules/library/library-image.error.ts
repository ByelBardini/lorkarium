export class LibraryImageNotFoundError extends Error {
  readonly code = 'LIBRARY_IMAGE_NOT_FOUND';
  constructor(campaignId: string, imageId: string) {
    super(
      `Image ${imageId} not found in campaign ${campaignId}; expected a library image of that campaign`,
    );
  }
}
