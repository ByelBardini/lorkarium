import { emit } from '@tauri-apps/api/event';
import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DesktopWindowError, TauriDesktopWindow } from '@/services/desktop-window';

type IpcCall = Readonly<{ command: string; args: unknown }>;

describe('TauriDesktopWindow', () => {
  let calls: IpcCall[];
  let maximized: boolean;
  let refusal: string | null;

  beforeEach(() => {
    calls = [];
    maximized = false;
    refusal = null;
    mockWindows('main');
    mockIPC(
      (command, args) => {
        calls.push({ command, args });
        if (refusal) throw new Error(refusal);
        if (command === 'plugin:window|is_maximized') return maximized;
        return null;
      },
      { shouldMockEvents: true },
    );
  });

  afterEach(() => clearMocks());

  it.each([
    ['minimize', 'plugin:window|minimize'],
    ['toggleMaximize', 'plugin:window|toggle_maximize'],
    ['close', 'plugin:window|close'],
  ] as const)('%s asks the main window by %s', async (method, command) => {
    await new TauriDesktopWindow()[method]();

    expect(calls).toContainEqual({ command, args: { label: 'main' } });
  });

  it('isMaximized answers what the shell says', async () => {
    maximized = true;

    await expect(new TauriDesktopWindow().isMaximized()).resolves.toBe(true);
  });

  it('a resize tells the listener the new maximized state', async () => {
    const seen: boolean[] = [];
    await new TauriDesktopWindow().onMaximizedChange((value) => seen.push(value));

    maximized = true;
    await emit('tauri://resize', { width: 1920, height: 1080 });

    await expect.poll(() => seen).toEqual([true]);
  });

  it('after unsubscribing a resize tells nothing', async () => {
    const seen: boolean[] = [];
    const unsubscribe = await new TauriDesktopWindow().onMaximizedChange((value) =>
      seen.push(value),
    );

    unsubscribe();
    await emit('tauri://resize', { width: 800, height: 600 });

    expect(calls.filter((call) => call.command === 'plugin:window|is_maximized')).toEqual([]);
    expect(seen).toEqual([]);
  });

  it('a refused command rejects with the command and the reason', async () => {
    refusal = 'window.minimize not allowed';

    const minimizing = new TauriDesktopWindow().minimize();

    await expect(minimizing).rejects.toBeInstanceOf(DesktopWindowError);
    await expect(minimizing).rejects.toMatchObject({
      message: expect.stringContaining('minimize') as unknown,
    });
    await expect(minimizing).rejects.toMatchObject({
      message: expect.stringContaining('window.minimize not allowed') as unknown,
    });
  });
});
