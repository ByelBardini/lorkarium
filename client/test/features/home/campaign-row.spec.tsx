import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { CampaignRow } from '@/features/home/campaign-row';
import { QUELM, VHARN } from '../../support/campaigns-api-fake';

function renderRow(campaign: CampaignSummaryDto): void {
  render(
    <MemoryRouter>
      <ul>
        <CampaignRow campaign={campaign} />
      </ul>
    </MemoryRouter>,
  );
}

describe('CampaignRow', () => {
  it('is a link named after the campaign that opens its detail', () => {
    renderRow(VHARN);
    expect(screen.getByRole('link', { name: /Os Sinos de Vharn/ })).toHaveAttribute(
      'href',
      `/campaigns/${VHARN.id}`,
    );
  });

  it('the meta of the master campaign lists system and member count', () => {
    renderRow(VHARN);
    expect(screen.getByText('D&D 5e · 3 participantes')).toBeInTheDocument();
  });

  it('the meta of a player campaign names the master', () => {
    renderRow(QUELM);
    expect(screen.getByText('Tormenta20 · mestre: Bia · 4 participantes')).toBeInTheDocument();
  });

  it('one member is "1 participante"', () => {
    renderRow({ ...VHARN, system: null, memberCount: 1 });
    expect(screen.getByText('1 participante')).toBeInTheDocument();
  });

  it.each([
    [VHARN, 'Mestre'],
    [QUELM, 'Jogador'],
  ])('shows the role of the user in %#', (campaign, role) => {
    renderRow(campaign);
    expect(screen.getByRole('link')).toHaveTextContent(role);
  });

  it('shows the description', () => {
    renderRow(VHARN);
    expect(screen.getByText('Um sino toca sozinho na torre de Vharn.')).toBeInTheDocument();
  });
});
