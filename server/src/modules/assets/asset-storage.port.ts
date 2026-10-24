import type { Readable } from 'node:stream';

/** An object read back from the storage, streamed to whoever asked for it. */
export type StoredObject = Readonly<{ body: Readable; size: number; contentType: string }>;

/** Where the asset bytes live (any S3-compatible service, §4.3); the key is never a file name. */
export interface AssetStoragePort {
  /** Creates the bucket when it is missing; called once when the app gets ready. */
  ensureBucket(): Promise<void>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** `null` when nothing was ever put under the key. */
  open(key: string): Promise<StoredObject | null>;
  /** Deletes the object; a key that holds nothing is not an error (idempotent). */
  remove(key: string): Promise<void>;
}
