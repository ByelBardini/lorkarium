import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { HomePage } from '@/features/home/home-page';
import { ANA } from '../../support/auth-api-fake';
import { TEST_NOW } from '../../support/app-dependencies';
import { QUELM, VHARN } from '../../support/campaigns-api-fake';
import { ClipboardFake } from '../../support/clipboard-fake';

function renderHome(campaigns: CampaignSummaryDto[]): void {
  const page = (): React.JSX.Element => (
    <HomePage
      user={ANA}
      campaigns={campaigns}
      now={TEST_NOW}
      greetingDraw={0}
      clipboard={new ClipboardFake()}
    />
  );
  const router = createMemoryRouter([{ path: '/', Component: page }], { initialEntries: ['/'] });
  render(<RouterProvider router={router} />);
}

describe('HomePage', () => {
  it('shows the date as overline and the first greeting as h1', async () => {
    renderHome([VHARN]);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('E aí, Ana.');
    expect(screen.getByText('Quarta, 14 de outubro')).toBeInTheDocument();
  });

  it('the "Continuar" band shows the campaign entered last with "Entrar na mesa" and "Detalhes"', async () => {
    const older = { ...QUELM, lastEnteredAt: '2026-10-01T12:00:00.000Z' };
    renderHome([older, VHARN]);
    const band = await screen.findByRole('region', { name: 'Continuar' });
    expect(within(band).getByRole('heading', { name: 'Os Sinos de Vharn' })).toBeInTheDocument();
    expect(within(band).getByRole('button', { name: 'Entrar na mesa' })).toBeInTheDocument();
    expect(within(band).getByRole('link', { name: 'Detalhes' })).toHaveAttribute(
      'href',
      `/campaigns/${VHARN.id}`,
    );
  });

  it('without any campaign entered there is no "Continuar" band', async () => {
    renderHome([{ ...VHARN, lastEnteredAt: null }, QUELM]);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('region', { name: 'Continuar' })).not.toBeInTheDocument();
  });

  it('without campaigns there is the greeting and the empty invitation, no band', async () => {
    renderHome([]);
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('E aí, Ana.');
    expect(screen.getByText('Você ainda não está em nenhuma mesa.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Continuar' })).not.toBeInTheDocument();
  });
});
