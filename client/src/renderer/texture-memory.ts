/** What a texture source costs on the GPU: its size in CSS pixels and its resolution (PixiJS
 *  `TextureSource.width`, `.height`, `.resolution`). */
export type TextureFootprint = Readonly<{ width: number; height: number; resolution: number }>;

const BYTES_PER_PIXEL = 4;
const BYTES_PER_MEGABYTE = 1024 * 1024;

/** The bytes the textures hold as RGBA8: width × height × resolution² × 4, each source counted
 *  once however many times it is listed.
 *
 *  Example: `textureMemoryBytes([{ width: 100, height: 50, resolution: 2 }]) // 80 000` */
export function textureMemoryBytes(sources: readonly TextureFootprint[]): number {
  let total = 0;
  for (const source of new Set(sources)) total += footprintBytes(source);
  return total;
}

/** Bytes as megabytes (÷ 1024²), the unit of the `texture.mb` gauge.
 *
 *  Example: `bytesToMegabytes(43_515_904) // 41.5` */
export function bytesToMegabytes(bytes: number): number {
  return bytes / BYTES_PER_MEGABYTE;
}

function footprintBytes({ width, height, resolution }: TextureFootprint): number {
  assertDimension('width', width);
  assertDimension('height', height);
  assertDimension('resolution', resolution);
  return width * height * resolution * resolution * BYTES_PER_PIXEL;
}

function assertDimension(field: keyof TextureFootprint, value: number): void {
  if (Number.isFinite(value) && value >= 0) return;
  throw new Error(`texture ${field}: expected a finite number ≥ 0, got ${String(value)}`);
}
