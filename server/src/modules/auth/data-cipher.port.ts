/** What a sealed value is for: each purpose gets a key of its own, so a value sealed for one never
 *  opens as another, and a blind index of one never matches another's. */
export type CipherPurpose =
  | 'user-email'
  | 'pending-email'
  | 'invitation-email'
  | 'totp-secret'
  | 'email-index'
  | 'recovery-code';

/** Field encryption at rest, keyed by `DATA_ENCRYPTION_KEY`.
 *
 *  - `seal` encrypts `plaintext`, bound to `context` (the row id, say): it only opens with the same
 *    purpose and context. Two seals of the same text differ.
 *  - `open` reverses `seal`; a wrong key, purpose or context, or a tampered value, throws.
 *  - `index` is a deterministic blind index (keyed hash) for equality lookups and uniqueness.
 *
 *  Example: `cipher.open('user-email', row.emailCipher, row.id) // 'bia@x.com'` */
export interface DataCipherPort {
  seal(purpose: CipherPurpose, plaintext: string, context: string): string;
  open(purpose: CipherPurpose, sealed: string, context: string): string;
  index(purpose: CipherPurpose, value: string): string;
}
