export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/** Where the physics box lands in the window, in CSS pixels from the top-left corner. */
export interface DiceBoxRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function assertAspect(aspect: number): void {
  if (Number.isFinite(aspect) && aspect > 0) return;
  throw new RangeError(`Dice box aspect ${aspect} is invalid: expected a finite number above 0.`);
}

function assertViewport({ width, height }: ViewportSize): void {
  const valid = (side: number): boolean => Number.isFinite(side) && side > 0;
  if (valid(width) && valid(height)) return;
  throw new RangeError(
    `Viewport ${width} × ${height} is invalid: expected a finite width and height above 0.`,
  );
}

/** The box of the roller (`aspect` = width / height of their window) fitted whole inside this
 *  window (contain): same trajectory on every screen, only the scale changes, with equal bands
 *  on the sides that are left over.
 *
 *  Example: `fitDiceBox(16 / 9, { width: 1080, height: 1920 }) // { left: 0, top: 656.25, width: 1080, height: 607.5 }` */
export function fitDiceBox(aspect: number, viewport: ViewportSize): DiceBoxRect {
  assertAspect(aspect);
  assertViewport(viewport);
  const byWidth = viewport.width / viewport.height <= aspect;
  const width = byWidth ? viewport.width : viewport.height * aspect;
  const height = byWidth ? viewport.width / aspect : viewport.height;
  return {
    left: (viewport.width - width) / 2,
    top: (viewport.height - height) / 2,
    width,
    height,
  };
}
