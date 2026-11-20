export type SanctionErrorCode =
  | 'TARGET_IS_ADMIN'
  | 'ALREADY_SUSPENDED'
  | 'SANCTION_UNTIL_PAST'
  | 'SANCTION_NOT_FOUND'
  | 'SANCTION_REPORT_NOT_FOUND'
  | 'APPEAL_ALREADY_DECIDED';

/** Every refusal of the measures; the edge maps `code` to status and a public message. */
export class SanctionError extends Error {
  constructor(
    readonly code: SanctionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SanctionError';
  }
}

// An admin is demoted first: a measure on an admin would leave the backoffice in their hands.
export class TargetIsAdminError extends SanctionError {
  constructor(readonly userId: string) {
    super('TARGET_IS_ADMIN', `account ${userId} is an admin; expected a user account`);
  }
}

export class AlreadySuspendedError extends SanctionError {
  constructor(
    readonly userId: string,
    readonly suspendedAt: Date,
  ) {
    super(
      'ALREADY_SUSPENDED',
      `account ${userId} is suspended since ${suspendedAt.toISOString()}; expected an active account`,
    );
  }
}

export class SanctionUntilPastError extends SanctionError {
  constructor(
    readonly until: Date,
    readonly now: Date,
  ) {
    super(
      'SANCTION_UNTIL_PAST',
      `suspension end ${until.toISOString()} is not after ${now.toISOString()}; expected a future end`,
    );
  }
}

export class SanctionNotFoundError extends SanctionError {
  constructor(readonly sanctionId: string) {
    super('SANCTION_NOT_FOUND', `no measure with id ${sanctionId}`);
  }
}

// Same refusal for a report that does not exist and one about another account.
export class SanctionReportNotFoundError extends SanctionError {
  constructor(
    readonly reportId: string,
    readonly userId: string,
  ) {
    super(
      'SANCTION_REPORT_NOT_FOUND',
      `no report ${reportId} about account ${userId}; expected a report on the sanctioned account`,
    );
  }
}

export class AppealAlreadyDecidedError extends SanctionError {
  constructor(
    readonly sanctionId: string,
    readonly outcome: string,
  ) {
    super(
      'APPEAL_ALREADY_DECIDED',
      `the appeal of measure ${sanctionId} was already decided (${outcome}); expected an open appeal`,
    );
  }
}
