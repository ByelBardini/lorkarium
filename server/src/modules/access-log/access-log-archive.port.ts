/** Where the access log batches go: write-only, each key written once. In production an S3 bucket
 *  whose lifecycle rule deletes every object after 184 days (see `docs/context/deploy/aws.md`). */
export interface AccessLogArchivePort {
  /** Stores one batch of JSON Lines under a new key; throws citing the key when the write fails. */
  store(key: string, jsonLines: string): Promise<void>;
}
