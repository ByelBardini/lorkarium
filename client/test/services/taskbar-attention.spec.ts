import { clearMocks, mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TauriTaskbarAttention } from '@/services/taskbar-attention';

type IpcCall = Readonly<{ command: string; args: unknown }>;

// `UserAttentionType.Informational` on the wire: tao's `FLASHW_TRAY`, 4 flashes, then lit.
const INFORMATIONAL = { type: 'Informational' };

describe('TauriTaskbarAttention', () => {
  let calls: IpcCall[];
  let refusal: string | null;

  beforeEach(() => {
    calls = [];
    refusal = null;
    mockWindows('main');
    mockIPC((command, args) => {
      calls.push({ command, args });
      if (refusal) throw new Error(refusal);
      return null;
    });
  });

  afterEach(() => clearMocks());

  it('request asks the main window for informational attention', async () => {
    new TauriTaskbarAttention().request();

    await vi.waitFor(() =>
      expect(calls).toContainEqual({
        command: 'plugin:window|request_user_attention',
        args: { label: 'main', value: INFORMATIONAL },
      }),
    );
  });

  it('stop asks for no attention, which puts the button out', async () => {
    new TauriTaskbarAttention().stop();

    await vi.waitFor(() =>
      expect(calls).toContainEqual({
        command: 'plugin:window|request_user_attention',
        args: { label: 'main', value: null },
      }),
    );
  });

  it('an older shell refusing the permission is swallowed', async () => {
    refusal = 'window.request_user_attention not allowed';
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => void rejections.push(reason);
    process.on('unhandledRejection', onRejection);

    new TauriTaskbarAttention().request();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    await new Promise((settle) => setTimeout(settle, 0));

    process.off('unhandledRejection', onRejection);
    expect(rejections).toEqual([]);
  });
});
