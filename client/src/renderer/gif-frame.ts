/** When a frame of an animated image shows, in ms from the start of the loop. */
export type TimedFrame = Readonly<{ start: number; end: number }>;

/** The frame showing `ms` after the animation started, looping: picked by the time of the board's
 *  animator, never by a ticker of its own (`GifSprite` would ride `Ticker.shared`).
 *
 *  Example: `sprite.texture = source.frames[gifFrameAt(source.frames, seconds * 1000)].texture` */
export function gifFrameAt(frames: readonly TimedFrame[], ms: number): number {
  const last = frames.at(-1);
  if (!last) {
    throw new RangeError(
      `An animated image with ${frames.length} frames cannot play: expected at least 1 frame.`,
    );
  }
  const at = last.end > 0 ? ms % last.end : 0;
  const index = frames.findIndex(({ end }) => at < end);
  return index === -1 ? frames.length - 1 : index;
}
