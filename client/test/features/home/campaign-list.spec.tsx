import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { CampaignSummaryDto } from '@lorkarium/contracts';
import { CampaignList } from '@/features/home/campaign-list';
import { QUELM, VHARN } from '../../support/campaigns-api-fake';

const THIRD = { ...QUELM, id: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b', name: 'A Torre de Quelm' };

function renderList(campaigns: CampaignSummaryDto[]) {
  const onCreate = vi.fn();
  const onJoin = vi.fn();
  render(
    <MemoryRouter>
      <CampaignList campaigns={campaigns} onCreate={onCreate} onJoin={onJoin} />
    </MemoryRouter>,
  );
  return { onCreate, onJoin };
}

describe('CampaignList', () => {
  it('counts "3 mesas" and shows one row each', () => {
    renderList([VHARN, QUELM, THIRD]);
    expect(screen.getByText('3 mesas')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('searching "vharn" leaves one row and counts "1 mesa"', async () => {
    renderList([VHARN, QUELM, THIRD]);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar mesa' }), 'vharn');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('1 mesa')).toBeInTheDocument();
  });

  it('a search nobody matches quotes the term', async () => {
    renderList([VHARN, QUELM]);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar mesa' }), 'xyz');
    expect(screen.getByText(/Nenhuma mesa com “xyz”/)).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('with no campaign at all, invites to create or join and the buttons call back', async () => {
    const { onCreate, onJoin } = renderList([]);
    expect(screen.getByText('Você ainda não está em nenhuma mesa.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nova mesa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Entrar com código' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it('with campaigns, the empty invitation does not show', () => {
    renderList([VHARN]);
    expect(screen.queryByText('Você ainda não está em nenhuma mesa.')).not.toBeInTheDocument();
  });
});
