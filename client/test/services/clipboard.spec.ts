import { afterEach, describe, expect, it } from 'vitest';
import { NavigatorClipboard } from '@/services/clipboard';

/** Stands in for `navigator.clipboard`; `denied` rejects like a refused permission. */
class SystemClipboardFake {
  readonly written: string[] = [];

  constructor(private readonly denied = false) {}

  async writeText(text: string): Promise<void> {
    if (this.denied) throw new DOMException('denied', 'NotAllowedError');
    this.written.push(text);
  }
}

function installClipboard(fake: SystemClipboardFake): void {
  Object.defineProperty(navigator, 'clipboard', { value: fake, configurable: true });
}

describe('NavigatorClipboard', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('writes the text and resolves true', async () => {
    const system = new SystemClipboardFake();
    installClipboard(system);
    expect(await new NavigatorClipboard().copy('VHRN-7K2Q')).toBe(true);
    expect(system.written).toEqual(['VHRN-7K2Q']);
  });

  it('a refused write resolves false instead of throwing', async () => {
    installClipboard(new SystemClipboardFake(true));
    expect(await new NavigatorClipboard().copy('VHRN-7K2Q')).toBe(false);
  });
});
