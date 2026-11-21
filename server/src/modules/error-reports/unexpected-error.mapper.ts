/** The account an unexpected error happened to; the @ only when the request log knew it. */
export type ErrorReportUser = Readonly<{ id: string; username: string | null }>;

/** What one `log.error`/`log.fatal` call becomes before the throttle and the sink see it. */
export type UnexpectedError = Readonly<{
  /** The thrown value, without the query params of a Drizzle error; null = a log line only. */
  error: Error | null;
  message: string;
  /** The other fields of the log object (never `err`, `userId` nor `params`). */
  fields: Readonly<Record<string, unknown>>;
  /** `reqId`, `route` and `method` of the request log, when the call came from one. */
  context: Readonly<Record<string, string>>;
  user: ErrorReportUser | null;
}>;

const CONTEXT_KEYS = ['reqId', 'route', 'method'] as const;
// The account goes to `user`, the params of a query are the values a user typed, and `req`/`res`
// (Fastify's own 5xx line) carry the request the context already names.
const LIFTED_FIELDS = new Set(['err', 'userId', 'username', 'params', 'req', 'res']);
const MAX_CAUSE_DEPTH = 5;
const FALLBACK_MESSAGE = 'error log without a message';

/** The pino arguments of an error log (`[obj, msg]`, `[err]`, `[msg]`) and the logger's bindings,
 *  as a report.
 *
 *  Example: `unexpectedErrorOf([{ err }, 'unexpected error in the auth module'], { reqId: 'r1' })` */
export function unexpectedErrorOf(
  args: readonly unknown[],
  bindings: Readonly<Record<string, unknown>>,
): UnexpectedError {
  const [first, second] = args;
  const logMessage = typeof second === 'string' ? second : null;
  if (typeof first === 'string') return reportOf(null, first, {}, bindings);
  if (first instanceof Error) return reportOf(first, logMessage ?? first.message, {}, bindings);
  const object = isRecord(first) ? first : {};
  const error = object.err instanceof Error ? object.err : null;
  return reportOf(error, logMessage ?? error?.message ?? FALLBACK_MESSAGE, object, bindings);
}

/** One value for the reports that are the same failure: the log message, the error type and its
 *  message with ids and numbers blanked, and the first stack frame.
 *
 *  Example: `errorFingerprintOf(report) // 'unexpected…|Error|campaign <uuid> …|at f (a.ts:1:1)'` */
export function errorFingerprintOf(report: UnexpectedError): string {
  const { error } = report;
  const frame = error?.stack?.split('\n').find((line) => line.trim().startsWith('at ')) ?? '';
  const parts = [report.message, error?.name ?? '', error?.message ?? '', frame.trim()];
  return parts.map(withoutVaryingParts).join('|');
}

/** The error with every Drizzle query error in its cause chain stripped of the params, which
 *  `DrizzleQueryError` writes into the message and the stack; the original is never touched.
 *
 *  Example: `withoutQueryParams(drizzleError).message // 'Failed query: select …'` */
export function withoutQueryParams(error: Error, depth = 0): Error {
  const { cause } = error;
  const cleanCause =
    cause instanceof Error && depth < MAX_CAUSE_DEPTH
      ? withoutQueryParams(cause, depth + 1)
      : cause;
  if (isQueryError(error)) return queryErrorWithoutParams(error, cleanCause);
  return cleanCause === cause ? error : copyWithCause(error, cleanCause);
}

function reportOf(
  error: Error | null,
  message: string,
  object: Readonly<Record<string, unknown>>,
  bindings: Readonly<Record<string, unknown>>,
): UnexpectedError {
  const fields = Object.fromEntries(
    Object.entries(object).filter(([key]) => !LIFTED_FIELDS.has(key)),
  );
  const context: Record<string, string> = {};
  for (const key of CONTEXT_KEYS) {
    const value = bindings[key];
    if (typeof value === 'string') context[key] = value;
  }
  const clean = error ? withoutQueryParams(error) : null;
  return { error: clean, message, fields, context, user: userOf(object, bindings) };
}

function userOf(
  object: Readonly<Record<string, unknown>>,
  bindings: Readonly<Record<string, unknown>>,
): ErrorReportUser | null {
  if (typeof bindings.userId === 'string') {
    const username = typeof bindings.username === 'string' ? bindings.username : null;
    return { id: bindings.userId, username };
  }
  return typeof object.userId === 'string' ? { id: object.userId, username: null } : null;
}

type QueryError = Error & { query: unknown; params: unknown };

// Duck-typed on purpose: the module does not import the ORM.
function isQueryError(error: Error): error is QueryError {
  return 'query' in error && 'params' in error && error.message.startsWith('Failed query: ');
}

function queryErrorWithoutParams(error: QueryError, cause: unknown): Error {
  const clean = new Error(withoutParamsLine(error.message), { cause });
  clean.name = error.name;
  clean.stack = error.stack?.replace(/\nparams: [\s\S]*?(?=\n\s+at |$)/, '');
  return clean;
}

function withoutParamsLine(message: string): string {
  return message.replace(/\nparams: [\s\S]*$/, '');
}

function copyWithCause(error: Error, cause: unknown): Error {
  const copy = Object.assign(Object.create(Object.getPrototypeOf(error) as object) as Error, error);
  copy.message = error.message;
  if (error.stack !== undefined) copy.stack = error.stack;
  Object.defineProperty(copy, 'cause', { value: cause, writable: true, configurable: true });
  return copy;
}

function withoutVaryingParts(text: string): string {
  return text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d+/g, '<n>');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}
