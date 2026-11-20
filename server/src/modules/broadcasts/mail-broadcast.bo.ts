import { BroadcastsError } from './broadcasts.error';

/** What the locks of a notice look at: whether it was tested and whether it already went out. */
export type MailBroadcastState = Readonly<{
  id: string;
  testedAt: Date | null;
  confirmedAt: Date | null;
}>;

/** The locks of a mass notice, which cannot be undone once sent: only a draft is rewritten or
 *  tested, and the confirmation asks the admin's 2FA, a test sent before and the audience typed.
 *
 *  Example: `new MailBroadcastBo(state).requireConfirmable(twoFactorOn)` */
export class MailBroadcastBo {
  constructor(private readonly state: MailBroadcastState) {}

  requireDraft(): void {
    if (this.state.confirmedAt === null) return;
    throw new BroadcastsError(
      'ALREADY_CONFIRMED',
      `broadcast ${this.state.id} was confirmed at ${this.state.confirmedAt.toISOString()}: expected a draft`,
    );
  }

  requireConfirmable(twoFactorOn: boolean): void {
    this.requireDraft();
    if (!twoFactorOn) {
      throw new BroadcastsError(
        'TWO_FACTOR_REQUIRED',
        `broadcast ${this.state.id}: the confirming admin has no 2FA on; expected 2FA enabled`,
      );
    }
    if (this.state.testedAt !== null) return;
    throw new BroadcastsError(
      'TEST_REQUIRED',
      `broadcast ${this.state.id} has testedAt null: expected a test sent to the admin first`,
    );
  }

  /** The audience typed by hand must be the one frozen now. */
  static requireTypedTotal(typed: number, frozen: number): void {
    if (typed === frozen) return;
    throw new BroadcastsError(
      'CONFIRMATION_MISMATCH',
      `typed total ${typed} does not match the audience: expected ${frozen}`,
    );
  }
}
