import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OPEN_GATE } from '@/features/plans/plan-gate';
import { PlanLockSeal } from '@/features/plans/plan-lock-seal';

describe('PlanLockSeal', () => {
  it('a closed gate shows the lock named "Só leitura" with the sentence as its tooltip', () => {
    render(<PlanLockSeal gate={{ open: false, hint: 'Este grid passou do limite.' }} />);
    expect(screen.getByRole('img', { name: 'Só leitura' }).parentElement).toHaveAttribute(
      'title',
      'Este grid passou do limite.',
    );
  });

  it('an open gate shows nothing', () => {
    render(<PlanLockSeal gate={OPEN_GATE} />);
    expect(screen.queryByRole('img', { name: 'Só leitura' })).toBeNull();
  });
});
