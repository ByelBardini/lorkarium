import { render, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { SignedOutRedirect } from '@/components/signed-out-redirect';
import { createSessionStore } from '@/stores/session-store';
import { ANA } from '../support/auth-api-fake';

describe('SignedOutRedirect', () => {
  it('signs out and replaces the screen with the login, coming back to the path and query', async () => {
    const sessionStore = createSessionStore();
    sessionStore.getState().signedIn(ANA);
    const router = createMemoryRouter(
      [
        { path: '/account', element: <SignedOutRedirect sessionStore={sessionStore} /> },
        { path: '/login', element: null },
      ],
      { initialEntries: ['/', '/account?tab=x'], initialIndex: 1 },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?next=%2Faccount%3Ftab%3Dx');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(sessionStore.getState().session).toEqual({ status: 'anonymous' });
  });
});
