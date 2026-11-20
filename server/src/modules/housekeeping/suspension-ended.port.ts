import type { UserPo } from '../auth/users.po';

/** Told of each account whose suspension reached its end and was lifted by the housekeeping (the
 *  "your access is back" e-mail); the lifting is already saved.
 *
 *  Example: `await suspensionEnded.suspensionEnded(row)` */
export interface SuspensionEndedPort {
  suspensionEnded(account: UserPo): Promise<void>;
}
