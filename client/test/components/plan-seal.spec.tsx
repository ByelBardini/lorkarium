import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlanSeal } from '@/components/plan-seal';
import type { PlanSealHolder } from '@/lib/plan-seal';

const PLAIN: PlanSealHolder = {
  plan: 'free',
  admin: false,
  lorkariumOwner: false,
};

describe('PlanSeal', () => {
  it('lenda is the coat-of-arms symbol in gold, named and titled "Plano Lenda", without text', () => {
    render(<PlanSeal holder={{ ...PLAIN, plan: 'lenda' }} />);

    const seal = screen.getByRole('img', { name: 'Plano Lenda' });
    expect(seal).toHaveAttribute('title', 'Plano Lenda');
    expect(seal).toHaveAttribute('data-seal', 'lenda');
    expect(seal).toHaveStyle({ color: '#e0b25c' });
    expect(seal).toHaveTextContent('');
    expect(seal.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('an admin on Amigo do Dono shows only "Administrador", in ember', () => {
    render(<PlanSeal holder={{ plan: 'amigo_do_dono', admin: true, lorkariumOwner: false }} />);

    const seals = screen.getAllByRole('img');
    expect(seals.map((seal) => seal.getAttribute('aria-label'))).toEqual(['Administrador']);
    expect(seals[0]).toHaveStyle({ color: '#e0704f' });
  });

  it('the Dono do Lorkarium is the logo symbol in bone', () => {
    render(<PlanSeal holder={{ ...PLAIN, admin: true, lorkariumOwner: true }} />);

    const seal = screen.getByRole('img', { name: 'Dono do Lorkarium' });
    expect(seal).toHaveAttribute('data-seal', 'lorkarium_owner');
    expect(seal.querySelector('svg')).toHaveAttribute('viewBox', '0 0 120 120');
  });

  it('free without the mark renders nothing', () => {
    const { container } = render(<PlanSeal holder={PLAIN} />);

    expect(container).toBeEmptyDOMElement();
  });
});
