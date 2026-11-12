export const CROP_ZOOM_MIN = 1;
export const CROP_ZOOM_MAX = 3;
export const CROP_ZOOM_STEP = 0.1;

/** The zoom one key press away (`+` in, `-` out), kept between 1× and 3×; rounded to the step so
 *  repeated presses never drift (1.1 + 0.1 is not 1.2 in floating point).
 *
 *  Example: `steppedCropZoom(2.95, 'in') // 3` */
export function steppedCropZoom(zoom: number, direction: 'in' | 'out'): number {
  const next = zoom + (direction === 'in' ? CROP_ZOOM_STEP : -CROP_ZOOM_STEP);
  const rounded = Math.round(next / CROP_ZOOM_STEP) * CROP_ZOOM_STEP;
  return Math.min(CROP_ZOOM_MAX, Math.max(CROP_ZOOM_MIN, Number(rounded.toFixed(2))));
}

/** The zoom as it is read aloud and shown next to the slider ("1,5×").
 *
 *  Example: `cropZoomText(1.5) // '1,5×'` */
export function cropZoomText(zoom: number): string {
  return `${zoom.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×`;
}
