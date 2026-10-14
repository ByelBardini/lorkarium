/** Replaces the query string without creating a history entry.
 *
 *  Example: `replaceQuery('?zoom=2')` */
export function replaceQuery(query: string): void {
  window.history.replaceState(null, '', query);
}
