/** `pnpm db:recompress-images` against production without the confirmation: it rewrites the
 *  objects of every table in place, so it never runs there by accident. */
export class RecompressImagesRefusedError extends Error {
  readonly code = 'RECOMPRESS_IMAGES_REFUSED';

  constructor(readonly nodeEnv: string) {
    super(
      `the image recompression rewrites stored files; received NODE_ENV=${nodeEnv} without --yes, expected --yes (or --dry-run) in production`,
    );
    this.name = 'RecompressImagesRefusedError';
  }
}
