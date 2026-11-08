import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** Types `hex` in the custom color panel already open and presses "Usar cor". */
export async function applyTypedCustomColor(hex: string): Promise<void> {
  const user = userEvent.setup();
  const code = await screen.findByLabelText('Código da cor');
  await user.clear(code);
  await user.type(code, hex);
  await user.click(screen.getByRole('button', { name: 'Usar cor' }));
}

/** Opens the custom color tile and applies `hex` through its panel. */
export async function pickCustomColor(tile: HTMLElement, hex: string): Promise<void> {
  await userEvent.setup().click(tile);
  await applyTypedCustomColor(hex);
}
