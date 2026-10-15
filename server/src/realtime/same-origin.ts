/** Whether a handshake comes from the app's own origin (spec §8.3). No Origin means a client that
 *  is not a browser: it passes here and still needs the session cookie.
 *
 *  Example: `isSameOrigin(req.headers.origin, req.headers.host) // true for the Vite proxy` */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  if (host === undefined || !URL.canParse(origin)) return false;
  return new URL(origin).host === host;
}
