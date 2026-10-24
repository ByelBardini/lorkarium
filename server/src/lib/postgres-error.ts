const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

type PostgresFailure = Readonly<{ code: string; constraint: string | undefined }>;

/** The Postgres error under a failed query: Drizzle wraps it in `cause`, the bare driver does not.
 *
 *  Example: `postgresFailureOf(error)?.code // '23505'` */
export function postgresFailureOf(error: unknown): PostgresFailure | undefined {
  if (!(error instanceof Error)) return undefined;
  return failureIn(error.cause) ?? failureIn(error);
}

/** A unique index refused the write; with `constraint`, only that index counts.
 *
 *  Example: `isUniqueViolation(error, 'users_username_unique')` */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const failure = postgresFailureOf(error);
  if (failure?.code !== UNIQUE_VIOLATION) return false;
  return constraint === undefined || failure.constraint === constraint;
}

/** A foreign key refused the write (the row it points to is gone).
 *
 *  Example: `if (isForeignKeyViolation(error)) throw new CampaignNotFoundError(id)` */
export function isForeignKeyViolation(error: unknown): boolean {
  return postgresFailureOf(error)?.code === FOREIGN_KEY_VIOLATION;
}

function failureIn(value: unknown): PostgresFailure | undefined {
  if (typeof value !== 'object' || value === null || !('code' in value)) return undefined;
  if (typeof value.code !== 'string') return undefined;
  const constraint =
    'constraint' in value && typeof value.constraint === 'string' ? value.constraint : undefined;
  return { code: value.code, constraint };
}
