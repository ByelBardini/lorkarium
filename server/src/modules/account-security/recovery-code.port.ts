/** Draws one-time recovery codes, `xxxxx-xxxxx` over `RECOVERY_CODE_ALPHABET` (~50 bits).
 *
 *  Example: `recoveryCodes.generate() // 'k7m2p-9qrst'` */
export interface RecoveryCodePort {
  generate(): string;
}
