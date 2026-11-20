import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceCodeLink } from '@/components/source-code-link';
import { SOURCE_CODE_URL } from '@/lib/source-code';

describe('SourceCodeLink', () => {
  it('offers the public repository in a new tab, without handing it the opener', () => {
    render(<SourceCodeLink className="muted" />);
    const link = screen.getByRole('link', { name: 'Código-fonte' });

    expect(link).toHaveAttribute('href', 'https://github.com/ByelBardini/lorkarium');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveClass('muted');
  });

  it('keeps the address when children name the link', () => {
    render(<SourceCodeLink>Ver o código</SourceCodeLink>);

    expect(screen.getByRole('link', { name: 'Ver o código' })).toHaveAttribute(
      'href',
      SOURCE_CODE_URL,
    );
  });
});
