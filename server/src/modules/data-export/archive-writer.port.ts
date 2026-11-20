import type { Readable } from 'node:stream';

/** The files of one archive, added in order while its bytes already leave. */
export interface ArchiveEntries {
  /** A whole file kept in memory (the JSON, the text), compressed. */
  addFile(path: string, bytes: Uint8Array): Promise<void>;
  /** A file read from `body` as it arrives, stored as is (images are compressed already). */
  addStream(path: string, body: Readable): Promise<void>;
}

/** Builds a ZIP as a stream, never on disk: `fill` adds the entries, the archive closes when it
 *  resolves, and the stream fails with its error when it rejects.
 *
 *  Example: `reply.send(archives.stream(async (zip) => zip.addFile('a.txt', bytes)))` */
export interface ArchiveWriterPort {
  stream(fill: (entries: ArchiveEntries) => Promise<void>): Readable;
}
