import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ChatDeviceSwitch } from '@/features/account/chat-device-switch';
import { testDependencies } from '../../support/app-dependencies';

describe('ChatDeviceSwitch', () => {
  it('"Som do chat" starts on and muting it is remembered on the device at once', async () => {
    const deps = testDependencies();
    render(<ChatDeviceSwitch chatPreferences={deps.chatPreferences} />);
    const toggle = screen.getByRole('switch', { name: 'Som do chat' });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    expect(toggle).not.toBeChecked();
    expect(deps.chatPreferences.getState().sound).toBe(false);
    expect(deps.chatPreferencesStorage.values.get('lorkarium.chatSound')).toBe('off');
  });

  it('turning it back on is remembered too', async () => {
    const deps = testDependencies();
    deps.chatPreferences.getState().setSound(false);
    render(<ChatDeviceSwitch chatPreferences={deps.chatPreferences} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Som do chat' }));

    expect(deps.chatPreferences.getState().sound).toBe(true);
    expect(deps.chatPreferencesStorage.values.get('lorkarium.chatSound')).toBe('on');
  });

  it('muting the chat leaves the dice sound on: the switches are apart', async () => {
    const deps = testDependencies();
    render(<ChatDeviceSwitch chatPreferences={deps.chatPreferences} />);

    await userEvent.click(screen.getByRole('switch', { name: 'Som do chat' }));

    expect(deps.dicePreferences.getState().sound).toBe(true);
  });

  it('the hint says it is for mentions and whispers, on this device only', () => {
    const deps = testDependencies();
    render(<ChatDeviceSwitch chatPreferences={deps.chatPreferences} />);

    expect(screen.getByRole('switch', { name: 'Som do chat' })).toHaveAccessibleDescription(
      'Toca um aviso curto quando alguém te menciona com @ ou te sussurra. Vale só neste aparelho.',
    );
  });
});
