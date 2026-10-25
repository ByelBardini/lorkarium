import type { DesktopRelease } from '@/lib/desktop-release';
import type { ReleaseSource } from '@/services/release-source';

/** Answers `latest()` with a fixed release (or null), optionally after a gate the test opens. */
export class ReleaseSourceFake implements ReleaseSource {
  calls = 0;
  private gate: Promise<void> = Promise.resolve();
  private openGate: () => void = () => undefined;

  constructor(private readonly release: DesktopRelease | null) {}

  /** Holds every answer until `answer()` is called. */
  hold(): this {
    this.gate = new Promise((resolve) => {
      this.openGate = resolve;
    });
    return this;
  }

  answer(): void {
    this.openGate();
  }

  async latest(): Promise<DesktopRelease | null> {
    this.calls += 1;
    await this.gate;
    return this.release;
  }
}

export const RELEASE_0_3_1: DesktopRelease = {
  version: '0.3.1',
  sizeBytes: 8_808_038,
  url: 'https://github.com/ByelBardini/lorkarium/releases/download/desktop-v0.3.1/Lorkarium_0.3.1_x64-setup.exe',
  publishedAt: '2026-10-20T12:00:00Z',
};
