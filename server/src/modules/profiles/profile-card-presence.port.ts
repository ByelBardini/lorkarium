/** What the card reads of the account presence (the friends' online/invisible status). */
export interface ProfileCardPresencePort {
  /** Online or away as friends see it; false while invisible or offline. */
  isVisiblyOnline(userId: string): boolean;
}
