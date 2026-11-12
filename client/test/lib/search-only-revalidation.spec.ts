import type { ShouldRevalidateFunctionArgs } from 'react-router';
import { describe, expect, it } from 'vitest';
import { skipSearchOnlyRevalidation } from '@/lib/search-only-revalidation';

function argsOf(
  current: string,
  next: string,
  extra: Partial<ShouldRevalidateFunctionArgs> = {},
): ShouldRevalidateFunctionArgs {
  return {
    currentUrl: new URL(current, 'http://localhost'),
    currentParams: {},
    nextUrl: new URL(next, 'http://localhost'),
    nextParams: {},
    defaultShouldRevalidate: true,
    ...extra,
  };
}

describe('skipSearchOnlyRevalidation', () => {
  it('a change of the query alone on the same path reloads nothing', () => {
    expect(skipSearchOnlyRevalidation(argsOf('/account', '/account?aba=plano'))).toBe(false);
    expect(skipSearchOnlyRevalidation(argsOf('/account?aba=dados', '/account'))).toBe(false);
  });

  it('a submission on the same page still reloads', () => {
    const submitted = argsOf('/account', '/account?aba=plano', { formMethod: 'POST' });
    expect(skipSearchOnlyRevalidation(submitted)).toBe(true);
  });

  it('another path, or the same URL (a revalidation), follows the default', () => {
    expect(skipSearchOnlyRevalidation(argsOf('/account', '/home?aba=plano'))).toBe(true);
    expect(skipSearchOnlyRevalidation(argsOf('/account?aba=plano', '/account?aba=plano'))).toBe(
      true,
    );
    const declined = argsOf('/account', '/home', { defaultShouldRevalidate: false });
    expect(skipSearchOnlyRevalidation(declined)).toBe(false);
  });
});
