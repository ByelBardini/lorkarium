// Drizzle wraps the driver error ("Failed query: …") and keeps the reason in cause; a refused
// connection is an AggregateError with no message, only its code (ECONNREFUSED).
/** One line for a CLI that names the error and every cause under it.
 *
 *  Example: `failureText(new Error('Failed query', { cause: refused })) // 'Failed query (ECONNREFUSED)'` */
export function failureText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const own = error.message || codeOf(error) || error.name;
  return error.cause === undefined ? own : `${own} (${failureText(error.cause)})`;
}

function codeOf(error: Error): string {
  return 'code' in error && typeof error.code === 'string' ? error.code : '';
}
