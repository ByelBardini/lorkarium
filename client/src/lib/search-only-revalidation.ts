import type { ShouldRevalidateFunctionArgs } from 'react-router';

/** A route's `shouldRevalidate` for pages whose query only picks what to show (the filters of
 *  the backoffice, the tab of "Minha conta"): changing it alone reloads nothing; a submission, a
 *  revalidation or another path still does.
 *
 *  Example: `{ loader, shouldRevalidate: skipSearchOnlyRevalidation }` */
export function skipSearchOnlyRevalidation({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
  const onlySearch =
    !formMethod && currentUrl.pathname === nextUrl.pathname && currentUrl.search !== nextUrl.search;
  return onlySearch ? false : defaultShouldRevalidate;
}
