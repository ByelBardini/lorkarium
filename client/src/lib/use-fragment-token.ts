import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** The `token` of a one-time link (`…#token=abc`): read once into state, and the fragment is
 *  replaced away (no new history entry), so a reload or a shared screenshot does not carry it.
 *  The fragment never reaches the server nor a `Referer`. `null` when the link has none.
 *
 *  Example: `const token = useFragmentToken() // 'abc', and the URL loses '#token=abc'` */
export function useFragmentToken(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token'));
  useEffect(() => {
    if (location.hash)
      void navigate({ pathname: location.pathname, search: location.search }, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate]);
  return token?.trim() ? token : null;
}
