import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from '@/components/status-badge';

describe('StatusBadge', () => {
  it.each([
    ['building', 'Em construção'],
    ['recruiting', 'Recrutando'],
    ['ongoing', 'Em andamento'],
    ['finished', 'Finalizada'],
  ] as const)('%s says "%s" in text, the dot hidden from screen readers', (status, label) => {
    const { container } = render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('');
  });
});
