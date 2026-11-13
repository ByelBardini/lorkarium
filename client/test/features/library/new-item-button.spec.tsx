import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NewItemButton } from '@/features/library/new-item-button';

class NewItemRequests {
  count = 0;
  ask = (): void => {
    this.count += 1;
  };
}

describe('NewItemButton', () => {
  it('"Novo" asks for the "Novo item" dialog in one click, with no menu in between', async () => {
    const requests = new NewItemRequests();
    render(<NewItemButton live onClick={requests.ask} />);
    const button = screen.getByRole('button', { name: 'Novo' });
    expect(button).not.toHaveAttribute('aria-haspopup');
    await userEvent.click(button);
    expect(requests.count).toBe(1);
  });

  it('is off while the table reconnects, and asks nothing', async () => {
    const requests = new NewItemRequests();
    render(<NewItemButton live={false} onClick={requests.ask} />);
    await userEvent.click(screen.getByRole('button', { name: 'Novo' }));
    expect(screen.getByRole('button', { name: 'Novo' })).toBeDisabled();
    expect(requests.count).toBe(0);
  });
});
