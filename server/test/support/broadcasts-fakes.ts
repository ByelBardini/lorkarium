import type {
  ClaimedDelivery,
  DeliveryFailurePo,
  MailBroadcastDeliveriesDao,
} from '../../src/modules/broadcasts/mail-broadcast-deliveries.dao';
import type { BroadcastSenderLog } from '../../src/modules/broadcasts/broadcast-sender.service';
import type { SendPacePort } from '../../src/modules/broadcasts/send-pace.port';
import type { UserPo } from '../../src/modules/auth/users.po';
import type { AudienceSegment } from '../../src/modules/broadcasts/broadcast-audience.dao';
import type {
  BroadcastConfirmation,
  BroadcastConfirmationRunner,
  BroadcastDrafts,
} from '../../src/modules/broadcasts/broadcasts.service';
import type {
  MailBroadcastLetterPo,
  MailBroadcastRow,
} from '../../src/modules/broadcasts/mail-broadcasts.dao';
import type {
  MailBroadcastPo,
  NewMailBroadcastPo,
} from '../../src/modules/broadcasts/mail-broadcasts.po';

type DeliveriesSlice = Pick<
  MailBroadcastDeliveriesDao,
  'claim' | 'markSent' | 'markSkipped' | 'markFailed' | 'finishCompleted'
>;

/** A delivery ready to claim, for `account` (null = deleted) with the default letter. */
export function claimedDelivery(
  id: string,
  account: ClaimedDelivery['account'],
  attempts = 0,
): ClaimedDelivery {
  const letter = {
    subject: 'Os preços mudam em 30 dias',
    title: 'Novos preços',
    paragraphs: ['A partir de janeiro o Narrador custa R$ 19,90.'],
    button: null,
  };
  return { id, attempts, letter, account };
}

/** The queue in memory: `claim` hands out up to `limit` of `pending` (removing them) and records
 *  each call; every end of a delivery is recorded by id. `claimFailure` rejects the next claim. */
export class BroadcastDeliveriesFake implements DeliveriesSlice {
  readonly pending: ClaimedDelivery[] = [];
  readonly claims: Readonly<{ now: Date; until: Date; limit: number }>[] = [];
  readonly sent: Readonly<{ id: string; at: Date }>[] = [];
  readonly skipped: string[] = [];
  readonly failed: Readonly<{ id: string } & DeliveryFailurePo>[] = [];
  readonly finished: Date[] = [];
  claimFailure: Error | null = null;

  async claim(now: Date, until: Date, limit: number): Promise<ClaimedDelivery[]> {
    this.claims.push({ now, until, limit });
    if (this.claimFailure) throw this.claimFailure;
    return this.pending.splice(0, limit);
  }

  async markSent(deliveryId: string, at: Date): Promise<void> {
    this.sent.push({ id: deliveryId, at });
  }

  async markSkipped(deliveryId: string): Promise<void> {
    this.skipped.push(deliveryId);
  }

  async markFailed(deliveryId: string, failure: DeliveryFailurePo): Promise<void> {
    this.failed.push({ id: deliveryId, ...failure });
  }

  async finishCompleted(at: Date): Promise<number> {
    this.finished.push(at);
    return 0;
  }
}

/** Records each pause instead of waiting. */
export class SendPaceFake implements SendPacePort {
  readonly pauses: number[] = [];

  async pause(ms: number): Promise<void> {
    this.pauses.push(ms);
  }
}

/** Keeps every error the sender logs. */
export class BroadcastSenderLogFake implements BroadcastSenderLog {
  readonly errors: Readonly<{ fields: object; message: string }>[] = [];

  error(fields: object, message: string): void {
    this.errors.push({ fields, message });
  }
}

type DraftsAndLock = BroadcastDrafts & BroadcastConfirmation['broadcasts'];

/** The notices in memory, ids `b-1`, `b-2`…; `confirm` writes straight to the row, so the spec
 *  wraps the confirmation in `ConfirmationRunnerFake` to see a rollback. */
export class MailBroadcastsDaoFake implements DraftsAndLock {
  readonly rows: MailBroadcastRow[] = [];

  constructor(private readonly now: Date) {}

  async insert(values: NewMailBroadcastPo): Promise<MailBroadcastRow> {
    const row: MailBroadcastRow = {
      ...{ id: `b-${this.rows.length + 1}`, createdBy: null, createdAt: this.now },
      ...{ testedAt: null, confirmedAt: null, finishedAt: null, total: null, button: null },
      ...values,
      ...{ sent: 0, failed: 0, skipped: 0 },
    } as MailBroadcastRow;
    this.rows.push(row);
    return row;
  }

  async list(): Promise<MailBroadcastRow[]> {
    return [...this.rows].reverse();
  }

  async find(broadcastId: string): Promise<MailBroadcastRow | undefined> {
    return this.rows.find((row) => row.id === broadcastId);
  }

  async lock(broadcastId: string): Promise<MailBroadcastPo | undefined> {
    return this.find(broadcastId);
  }

  async rewrite(broadcastId: string, letter: MailBroadcastLetterPo): Promise<boolean> {
    return this.change(broadcastId, { ...letter, testedAt: null } as Partial<MailBroadcastRow>);
  }

  async markTested(broadcastId: string, at: Date): Promise<void> {
    this.change(broadcastId, { testedAt: at });
  }

  async confirm(broadcastId: string, total: number, at: Date): Promise<void> {
    this.change(broadcastId, { confirmedAt: at, total });
  }

  private change(broadcastId: string, values: Partial<MailBroadcastRow>): boolean {
    const index = this.rows.findIndex((row) => row.id === broadcastId);
    const row = this.rows[index];
    if (!row) return false;
    this.rows[index] = { ...row, ...values };
    return true;
  }
}

/** The audience of each segment by a fixed count; `freeze` records what was frozen. */
export class BroadcastAudienceFake {
  readonly frozen: Readonly<{ broadcastId: string; segment: AudienceSegment }>[] = [];

  constructor(private readonly counts: Readonly<{ all: number; paid: number; plan: number }>) {}

  async count(segment: AudienceSegment): Promise<number> {
    return typeof segment === 'string' ? this.counts[segment] : this.counts.plan;
  }

  async freeze(broadcastId: string, segment: AudienceSegment): Promise<number> {
    this.frozen.push({ broadcastId, segment });
    return this.count(segment);
  }
}

/** Runs the confirmation over the fakes and undoes what it wrote when the work throws, as the
 *  real transaction rolls back. */
export class ConfirmationRunnerFake {
  constructor(
    private readonly broadcasts: MailBroadcastsDaoFake,
    private readonly audience: BroadcastAudienceFake,
  ) {}

  readonly run: BroadcastConfirmationRunner = async (work) => {
    const rows = this.broadcasts.rows.map((row) => ({ ...row }));
    const frozen = this.audience.frozen.length;
    try {
      return await work({ broadcasts: this.broadcasts, audience: this.audience });
    } catch (error) {
      this.broadcasts.rows.splice(0, this.broadcasts.rows.length, ...rows);
      this.audience.frozen.splice(frozen);
      throw error;
    }
  };
}

/** Says whether each account has 2FA on (`on` holds the ids). */
export class TwoFactorStateFake {
  readonly on = new Set<string>();

  async isEnabled(userId: string): Promise<boolean> {
    return this.on.has(userId);
  }
}

/** The account rows the service reads by id (the admin of the session). */
export class AccountRowsFake {
  constructor(private readonly rows: readonly UserPo[]) {}

  async findById(userId: string): Promise<UserPo | undefined> {
    return this.rows.find((row) => row.id === userId);
  }
}
