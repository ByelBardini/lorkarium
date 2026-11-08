import { isHexColor, type HexColorDto } from '@lorkarium/contracts';
import { useLayoutEffect, useRef } from 'react';
import { HexColorPicker } from 'react-colorful';

export type HexColorCanvasProps = Readonly<{
  color: HexColorDto;
  /** A new color while dragging or on the arrows: a preview, never a command. */
  onDraft: (color: HexColorDto) => void;
}>;

// The library injects an unlayered stylesheet, which beats any Tailwind layer without `!`.
// The bottom border is the library's black band between the area and the hue bar.
const CANVAS_LOOK = [
  'h-52! w-full! gap-3',
  '[&>:first-child]:rounded-sm! [&>:first-child]:border-b-0!',
  '[&>:last-child]:h-3! [&>:last-child]:rounded-sm!',
  '[&_[class*=-pointer]]:size-4!',
  // A thin dark outline, so the white pointer does not vanish on the pale side of the area.
  '[&_[class*=-pointer]]:shadow-[0_0_0_1px_rgb(0_0_0/0.5)]!',
].join(' ');

const SATURATION_CONTROL = '.react-colorful__saturation .react-colorful__interactive';
const HUE_CONTROL = '.react-colorful__hue .react-colorful__interactive';

function nameControlsInPortuguese(canvas: HTMLElement, color: HexColorDto): void {
  canvas.querySelector(HUE_CONTROL)?.setAttribute('aria-label', 'Matiz');
  const saturation = canvas.querySelector(SATURATION_CONTROL);
  saturation?.setAttribute('aria-label', 'Saturação e brilho');
  saturation?.setAttribute('aria-valuetext', color);
}

/** The color area and the hue bar; the only place of `react-colorful`.
 *
 *  Example: `<HexColorCanvas color={draft} onDraft={setDraft} />` */
export function HexColorCanvas({ color, onDraft }: HexColorCanvasProps): React.JSX.Element {
  const canvas = useRef<HTMLDivElement>(null);
  // The library writes its English names with no prop to change them.
  useLayoutEffect(() => {
    if (canvas.current) nameControlsInPortuguese(canvas.current, color);
  }, [color]);
  return (
    <div ref={canvas}>
      <HexColorPicker
        className={CANVAS_LOOK}
        color={color}
        onChange={(next) => {
          if (isHexColor(next)) onDraft(next);
        }}
      />
    </div>
  );
}
