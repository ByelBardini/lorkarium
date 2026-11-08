import type { Renderer, TextureSource } from 'pixi.js';
import { NO_PERF_PROBE, type PerfProbe } from '@/lib/perf-probe';
import { bytesToMegabytes, textureMemoryBytes } from './texture-memory';

const SAMPLE_EVERY_MS = 1000;

/** Feeds the dev panel (`?perf=1`) the memory of every texture the GPU holds, once per second;
 *  with `NO_PERF_PROBE` (production) it never walks the textures.
 *
 *  Example: `app.ticker.add(() => gauge.sample(performance.now(), app.renderer))` */
export class PixiTextureGauge {
  private sampledAtMs = -Infinity;

  constructor(private readonly probe: PerfProbe) {}

  sample(nowMs: number, renderer: Renderer): void {
    if (this.probe === NO_PERF_PROBE || nowMs - this.sampledAtMs < SAMPLE_EVERY_MS) return;
    this.sampledAtMs = nowMs;
    this.probe.gauge(
      'texture.mb',
      bytesToMegabytes(textureMemoryBytes(managedSourcesOf(renderer))),
    );
  }
}

// Deprecated since Pixi 8.15 with no public replacement; a texture that left is a `null` slot.
// The canvas fallback keeps no list: it reports nothing rather than a wrong number.
function managedSourcesOf(renderer: Renderer): TextureSource[] {
  const system = renderer.texture;
  if (!('managedTextures' in system)) return [];
  const managed: ReadonlyArray<TextureSource | null> = system.managedTextures;
  return managed.filter((source): source is TextureSource => source !== null);
}
