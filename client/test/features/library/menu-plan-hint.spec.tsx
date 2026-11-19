import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import { PlanGatedMenuItem } from '@/features/library/menu-plan-hint';
import { OPEN_GATE, type PlanGate } from '@/features/plans/plan-gate';

const CLOSED: PlanGate = { open: false, hint: 'Disponível no plano Narrador' };

function openMenuWith(gate: PlanGate, onSelect: () => void): void {
  render(
    <ContextMenu>
      <ContextMenuTrigger>Grid</ContextMenuTrigger>
      <ContextMenuContent>
        <PlanGatedMenuItem gate={gate} onSelect={onSelect}>
          Duplicar
        </PlanGatedMenuItem>
      </ContextMenuContent>
    </ContextMenu>,
  );
  fireEvent.contextMenu(screen.getByText('Grid'));
}

describe('PlanGatedMenuItem', () => {
  it('a closed gate shows no sentence until the item is chosen', () => {
    openMenuWith(CLOSED, () => undefined);

    const item = screen.getByRole('menuitem', { name: 'Duplicar' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription('Disponível no plano Narrador');
    expect(screen.getByText('Disponível no plano Narrador')).toHaveClass('sr-only');
  });

  it('choosing a closed item keeps the menu open, shows the sentence and does nothing', async () => {
    const onSelect = vi.fn();
    openMenuWith(CLOSED, onSelect);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicar' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Disponível no plano Narrador')).not.toHaveClass('sr-only');
  });

  it('an open gate runs the action, with no sentence', async () => {
    const onSelect = vi.fn();
    openMenuWith(OPEN_GATE, onSelect);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicar' }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByText('Disponível no plano Narrador')).toBeNull();
  });
});
