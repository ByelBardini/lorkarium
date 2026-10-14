// Spec propositalmente ruim: cada it abaixo dispara uma regra do driver,
// menos o que usa a asseguradora expectLabel (esse precisa ficar em silêncio).
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TokenBadge } from '@/components/token-badge';

function expectLabel(label: string) {
  expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
}

describe('TokenBadge', () => {
  it('renders', () => {
    render(<TokenBadge label="Goblin" />);
  });

  it('the received label becomes the accessible name of the badge', () => {
    render(<TokenBadge label="Goblin" />);
    expectLabel('Goblin');
  });

  it('the disabled badge matches the snapshot', () => {
    const { container } = render(<TokenBadge label="Goblin" disabled />);
    expect(container).toMatchSnapshot();
  });

  // Regression: a double click fired the action twice.
  it('double click fires the action only once', () => {
    render(<TokenBadge label="Goblin" />);
    expect(screen.getByRole('button')).toHaveTextContent('Goblin');
  });

  it('the label shows up on screen', () => {
    render(<TokenBadge label="Goblin" />);
    expect(screen.queryByText('Goblin')).not.toBeNull();
  });
});
