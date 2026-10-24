import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CampaignPreviewCard, type CampaignPreview } from '@/components/campaign-preview-card';

const DRAFT: CampaignPreview = {
  name: 'Os Sinos de Vharn',
  system: 'D&D 5e',
  status: 'recruiting',
  description: 'Um sino toca sozinho na torre de Vharn.',
  visibility: 'private',
  hasPassword: false,
  cover: { kind: 'drawn', drawing: 2, tone: 1 },
  contentWarnings: [],
  tags: [],
};

function preview(): HTMLElement {
  return screen.getByRole('region', { name: 'Assim ela aparece no hub' });
}

describe('CampaignPreviewCard', () => {
  it('shows the name, the role, the status, the meta and the description', () => {
    render(<CampaignPreviewCard campaign={DRAFT} />);

    expect(preview()).toHaveTextContent('Os Sinos de Vharn');
    expect(preview()).toHaveTextContent('Mestre');
    expect(within(preview()).getByText('Recrutando')).toBeInTheDocument();
    expect(within(preview()).getByText('D&D 5e · privada')).toBeInTheDocument();
    expect(preview()).toHaveTextContent('Um sino toca sozinho na torre de Vharn.');
  });

  it('a blank name shows the waiting text', () => {
    render(<CampaignPreviewCard campaign={{ ...DRAFT, name: '   ' }} />);

    expect(within(preview()).getByText('Sua mesa nova')).toBeInTheDocument();
  });

  it('no system, public and with a password reads "Sistema a definir · pública · com senha"', () => {
    render(
      <CampaignPreviewCard
        campaign={{ ...DRAFT, system: ' ', visibility: 'public', hasPassword: true }}
      />,
    );

    expect(
      within(preview()).getByText('Sistema a definir · pública · com senha'),
    ).toBeInTheDocument();
  });

  it('lists the warnings before the tags, and at most 3 tags', () => {
    render(
      <CampaignPreviewCard
        campaign={{
          ...DRAFT,
          contentWarnings: ['gore', 'adult'],
          tags: ['Investigação', 'Masmorra', 'Sandbox', 'One-shot'],
        }}
      />,
    );

    const labels = within(preview()).getByRole('list', { name: 'Avisos e tags' });
    expect(
      within(labels)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['+18', 'Gore', 'Investigação', 'Masmorra', 'Sandbox']);
  });

  it('no warnings nor tags shows no list, and no description shows no paragraph for it', () => {
    render(<CampaignPreviewCard campaign={{ ...DRAFT, description: null }} />);

    expect(within(preview()).queryByRole('list')).toBeNull();
    expect(preview()).not.toHaveTextContent('Um sino');
  });

  it('a label names the preview instead of the hub line', () => {
    render(<CampaignPreviewCard campaign={DRAFT} label="Como aparece no hub" />);

    expect(screen.getByRole('region', { name: 'Como aparece no hub' })).toBeInTheDocument();
  });
});
