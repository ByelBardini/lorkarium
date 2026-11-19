import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { OPEN_GATE, type PlanGate } from '@/features/plans/plan-gate';
import { PlanGated } from '@/features/plans/plan-gated';

const CLOSED: PlanGate = { open: false, hint: 'Duplicar grid está no plano Narrador.' };

function renderGated(gate: PlanGate, act: () => void): void {
  render(
    <PlanGated gate={gate}>
      <Button onClick={gate.open ? act : undefined}>Duplicar</Button>
    </PlanGated>,
  );
}

describe('PlanGated', () => {
  it('a closed gate leaves the control off-looking and the sentence hidden', () => {
    renderGated(CLOSED, () => undefined);

    expect(screen.getByRole('button', { name: 'Duplicar' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByText(CLOSED.hint ?? '')).toBeNull();
  });

  it('a click on the closed control shows the sentence beside it and runs nothing', async () => {
    const act = vi.fn();
    renderGated(CLOSED, act);

    await userEvent.click(screen.getByRole('button', { name: 'Duplicar' }));

    expect(await screen.findByText('Duplicar grid está no plano Narrador.')).toBeVisible();
    expect(act).not.toHaveBeenCalled();
  });

  it('an open gate leaves the control as it is', async () => {
    const act = vi.fn();
    renderGated(OPEN_GATE, act);
    const button = screen.getByRole('button', { name: 'Duplicar' });

    await userEvent.click(button);

    expect(button).not.toHaveAttribute('aria-disabled');
    expect(act).toHaveBeenCalledOnce();
  });
});
