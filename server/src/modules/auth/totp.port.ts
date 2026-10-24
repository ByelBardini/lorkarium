/** Time-based one-time passwords (RFC 6238: SHA-1, 6 digits, 30 s steps).
 *
 *  - `generateSecret` draws a new base32 secret.
 *  - `uri` is the `otpauth://` URI an authenticator app reads (issuer Lorkarium, `account` as label).
 *  - `currentStep` is the time step of `at`.
 *  - `stepOf` is the step whose code is `code`, searched one step around `at`; `null` when none is.
 *
 *  Example: `totp.stepOf(secret, '287082', new Date(59_000)) // 1` */
export interface TotpPort {
  generateSecret(): string;
  uri(secret: string, account: string): string;
  currentStep(at: Date): number;
  stepOf(secret: string, code: string, at: Date): number | null;
}
