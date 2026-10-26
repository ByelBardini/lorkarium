import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DiceDeviceSwitches } from '@/features/account/dice-device-switches';
import { testDependencies } from '../../support/app-dependencies';

describe('DiceDeviceSwitches', () => {
  it('starts on and turning 3D off is remembered on the device', async () => {
    const deps = testDependencies();
    render(<DiceDeviceSwitches dicePreferences={deps.dicePreferences} />);
    const toggle = screen.getByRole('switch', { name: 'Dados 3D' });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(deps.dicePreferences.getState().threeD).toBe(false);
    expect(deps.dicePreferencesStorage.values.get('lorkarium.dice3d')).toBe('off');
  });

  it('turning 3D back on sets the preference on', async () => {
    const deps = testDependencies();
    deps.dicePreferences.getState().setThreeD(false);
    render(<DiceDeviceSwitches dicePreferences={deps.dicePreferences} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Dados 3D' }));

    expect(deps.dicePreferences.getState().threeD).toBe(true);
  });

  it('"Som dos dados" starts on and muting it leaves the 3D on', async () => {
    const deps = testDependencies();
    render(<DiceDeviceSwitches dicePreferences={deps.dicePreferences} />);
    const toggle = screen.getByRole('switch', { name: 'Som dos dados' });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(deps.dicePreferences.getState().sound).toBe(false);
    expect(deps.dicePreferences.getState().threeD).toBe(true);
    expect(deps.dicePreferencesStorage.values.get('lorkarium.diceSound')).toBe('off');
  });
});
