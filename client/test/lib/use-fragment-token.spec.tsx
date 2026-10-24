import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { useFragmentToken } from '@/lib/use-fragment-token';

function TokenProbe(): React.JSX.Element {
  const token = useFragmentToken();
  return <p>{token ?? 'sem token'}</p>;
}

function renderAt(entry: string): ReturnType<typeof createMemoryRouter> {
  const router = createMemoryRouter([{ path: '/link', Component: TokenProbe }], {
    initialEntries: ['/start', entry],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('useFragmentToken', () => {
  it('reads the token of the fragment once and takes the fragment off the URL', async () => {
    const router = renderAt('/link?x=1#token=abc');
    expect(screen.getByText('abc')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.hash).toBe(''));
    expect(router.state.location.search).toBe('?x=1');
    expect(screen.getByText('abc')).toBeInTheDocument();
  });

  it('replaces the entry instead of pushing a new one', async () => {
    const router = renderAt('/link#token=abc');
    await waitFor(() => expect(router.state.location.hash).toBe(''));
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it.each([['/link'], ['/link#token='], ['/link#other=1']])('%s has no token', (entry) => {
    renderAt(entry);
    expect(screen.getByText('sem token')).toBeInTheDocument();
  });
});
