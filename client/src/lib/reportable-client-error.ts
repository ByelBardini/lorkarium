// Failures the app already expects and shows: the network, an old chunk after a deploy, a browser
// quirk. None of them is a bug to report.
const EXPECTED_MESSAGES: readonly RegExp[] = [
  /^Failed to fetch$/,
  /^Load failed$/,
  /^NetworkError when attempting to fetch resource\.?$/,
  /Failed to fetch dynamically imported module/,
  /Importing a module script failed/,
  /error loading dynamically imported module/,
  /^ResizeObserver loop/,
];

// By name, not by class: `lib/` does not import the shell nor the services.
const EXPECTED_ERROR_NAMES: ReadonlySet<string> = new Set([
  'ApiLoadError',
  'NetworkUnavailableError',
  'AbortError',
]);

/** Whether a thrown value is a real bug worth a report: never an API failure the screen shows,
 *  a route's own response (404), an aborted request, the network nor a stale chunk.
 *
 *  Example: `isReportableClientError(new TypeError('x is undefined')) // true` */
export function isReportableClientError(error: unknown): boolean {
  if (isRouteResponse(error)) return false;
  if (EXPECTED_ERROR_NAMES.has(nameOf(error))) return false;
  const message = messageOf(error);
  return !EXPECTED_MESSAGES.some((pattern) => pattern.test(message));
}

// A DOMException is not an `Error` in every runtime; its name is what counts.
function nameOf(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('name' in error)) return '';
  return typeof error.name === 'string' ? error.name : '';
}

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}

// The shape of React Router's `isRouteErrorResponse`: a status the loader chose to answer.
function isRouteResponse(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return 'status' in error && 'statusText' in error && 'internal' in error;
}
