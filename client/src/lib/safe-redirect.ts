const HOME = '/';
const LOGIN = '/login';

/** The in-app path to go to after login, or `/` when `next` could leave the app (open redirect).
 *
 *  Example: `safeRedirectTarget(searchParams.get('next')) // '/admin' or '/'` */
export function safeRedirectTarget(next: string | null): string {
  if (!next || !next.startsWith('/')) return HOME;
  // `//host` and `/\host` are protocol-relative URLs to another origin in every browser.
  if (next.startsWith('//') || next.startsWith('/\\')) return HOME;
  const path = next.split(/[?#]/)[0];
  return path === LOGIN ? HOME : next;
}
