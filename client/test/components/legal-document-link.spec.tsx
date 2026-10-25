import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LegalDocumentLink } from '@/components/legal-document-link';

describe('LegalDocumentLink', () => {
  it('opens the legal text in a new tab without opener, titled by the document', () => {
    render(<LegalDocumentLink document="privacy" />);
    const link = screen.getByRole('link', { name: 'Política de privacidade' });
    expect(link).toHaveAttribute('href', '/api/legal/privacy');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('children replace the title and the other props reach the anchor', () => {
    render(
      <LegalDocumentLink document="terms" className="item" role="menuitem">
        Ler os termos
      </LegalDocumentLink>,
    );
    const link = screen.getByRole('menuitem', { name: 'Ler os termos' });
    expect(link).toHaveAttribute('href', '/api/legal/terms');
    expect(link).toHaveClass('item');
  });
});
