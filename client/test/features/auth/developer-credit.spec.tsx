import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeveloperCredit } from '@/features/auth/developer-credit';

describe('DeveloperCredit', () => {
  it('reads "Desenvolvido por Evolutiva Sistemas"', () => {
    render(<DeveloperCredit />);
    expect(screen.getByText(/Desenvolvido por/)).toHaveTextContent(
      'Desenvolvido por Evolutiva Sistemas',
    );
  });

  it('links "Evolutiva Sistemas" to the site in a new tab without opener', () => {
    render(<DeveloperCredit />);
    const link = screen.getByRole('link', { name: 'Evolutiva Sistemas' });
    expect(link).toHaveAttribute('href', 'https://evolutivasistemas.com.br');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('shows the Evolutiva logo as decoration, since the text already names it', () => {
    const { container } = render(<DeveloperCredit />);
    const logo = container.querySelector('img');
    expect(logo).toHaveAttribute('alt', '');
    expect(logo?.getAttribute('src')).toMatch(/evolutiva-mark/);
  });
});
