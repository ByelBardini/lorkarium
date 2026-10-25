// @vitest-environment jsdom
import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TauriShellBridge } from '../src/shell-bridge';

describe('TauriShellBridge', () => {
  let commands: string[];

  beforeEach(() => {
    commands = [];
    mockIPC(
      (command) => {
        commands.push(command);
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

  it('hands over the payload of the "startup" event Rust emits', async () => {
    const received: unknown[] = [];
    await new TauriShellBridge().onStartupEvent((payload) => received.push(payload));

    await emit('startup', { kind: 'offline' });

    expect(received).toEqual([{ kind: 'offline' }]);
  });
});
