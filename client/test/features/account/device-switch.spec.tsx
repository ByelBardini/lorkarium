import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DeviceSwitch } from '@/features/account/device-switch';

describe('DeviceSwitch', () => {
  function renderSwitch(checked: boolean, changes: boolean[]): void {
    render(
      <DeviceSwitch
        label="Som do chat"
        hint="Vale só neste aparelho."
        checked={checked}
        onCheckedChange={(next) => changes.push(next)}
      />,
    );
  }

  it('the title names the switch and the hint describes it', () => {
    renderSwitch(true, []);

    const toggle = screen.getByRole('switch', { name: 'Som do chat' });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription('Vale só neste aparelho.');
  });

  it('clicking an on switch asks for off', async () => {
    const changes: boolean[] = [];
    renderSwitch(true, changes);

    await userEvent.click(screen.getByRole('switch', { name: 'Som do chat' }));
    expect(changes).toEqual([false]);
  });

  it('clicking the title of an off switch asks for on', async () => {
    const changes: boolean[] = [];
    renderSwitch(false, changes);

    await userEvent.click(screen.getByText('Som do chat'));

    expect(changes).toEqual([true]);
  });
});
