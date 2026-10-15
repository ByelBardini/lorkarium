import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from '@/components/brand-mark';

describe('BrandMark', () => {
  it('exposes LORKARIUM as its accessible name and hides the decorative icon', () => {
    const { container } = render(<BrandMark />);
    expect(screen.getByRole('img', { name: 'LORKARIUM' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('the compact variant keeps the same accessible name', () => {
    render(<BrandMark variant="compact" />);
    expect(screen.getByRole('img', { name: 'LORKARIUM' })).toBeInTheDocument();
  });

  it('the icon variant shows only the crystal and keeps the accessible name', () => {
    render(<BrandMark variant="icon" />);
    const mark = screen.getByRole('img', { name: 'LORKARIUM' });
    expect(mark).not.toHaveTextContent('LORKARIUM');
  });
});
