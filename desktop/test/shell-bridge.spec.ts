// @vitest-environment jsdom
import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TauriShellBridge } from '../src/shell-bridge';

describe('TauriShellBridge', () => {
  let commands: string[];
  let windowLabels: unknown[];

  beforeEach(() => {
    commands = [];
    windowLabels = [];
    mockWindows('main');
    mockIPC(
      (command, payload) => {
        commands.push(command);
        if (command.startsWith('plugin:window|')) windowLabels.push(labelOf(payload));
      },
      { shouldMockEvents: true },
    );
  });

  afterEach(() => clearMocks());

  it('asks the shell to begin the opening by the command name Rust registers', async () => {
    await new TauriShellBridge().beginStartup();

    expect(commands).toContain('begin_startup');
  });

  it('asks the shell to retry by the command name Rust registers', async () => {
    await new TauriShellBridge().retryConnection();

    expect(commands).toContain('retry_connection');
  });

  it.each([
    ['minimizeWindow', 'plugin:window|minimize'],
    ['toggleMaximizeWindow', 'plugin:window|toggle_maximize'],
    ['closeWindow', 'plugin:window|close'],
  ] as const)('%s asks the main window by the command %s', async (method, command) => {
    await new TauriShellBridge()[method]();

    expect(commands).toEqual([command]);
    expect(windowLabels).toEqual(['main']);
  });

  it('hands over the payload of the "startup" event Rust emits', async () => {
    const received: unknown[] = [];
    await new TauriShellBridge().onStartupEvent((payload) => received.push(payload));

    await emit('startup', { kind: 'offline' });

    expect(received).toEqual([{ kind: 'offline' }]);
  });
});

function labelOf(payload: unknown): unknown {
  return typeof payload === 'object' && payload !== null && 'label' in payload
    ? payload.label
    : undefined;
}
