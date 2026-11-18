import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OPEN_GATE } from '@/features/plans/plan-gate';
import { MenuPlanHint } from '@/features/library/menu-plan-hint';

describe('MenuPlanHint', () => {
  it('a closed gate writes its sentence under the id the menu items point at', () => {
    render(<MenuPlanHint id="lock-hint" gate={{ open: false, hint: 'Disponível no Narrador' }} />);
    expect(screen.getByText('Disponível no Narrador')).toHaveAttribute('id', 'lock-hint');
  });

  it('an open gate writes nothing', () => {
    const { container } = render(<MenuPlanHint id="lock-hint" gate={OPEN_GATE} />);
    expect(container).toBeEmptyDOMElement();
  });
});
