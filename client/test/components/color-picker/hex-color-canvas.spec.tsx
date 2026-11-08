import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HexColorCanvas } from '@/components/color-picker/hex-color-canvas';

const HUE = 'Matiz';
const SATURATION_AND_BRIGHTNESS = 'Saturação e brilho';

// The library reads `keyCode`, which user-event leaves at 0 for the arrows.
function pressArrowRight(control: HTMLElement): void {
  fireEvent.keyDown(control, { key: 'ArrowRight', keyCode: 39 });
}

describe('HexColorCanvas', () => {
  it('shows the received color as the value of the hue control', () => {
    render(<HexColorCanvas color="#00ff00" onDraft={vi.fn()} />);

    expect(screen.getByRole('slider', { name: HUE })).toHaveAttribute('aria-valuenow', '120');
  });

  it('names the two controls in Portuguese', () => {
    render(<HexColorCanvas color="#336699" onDraft={vi.fn()} />);

    expect(screen.getByRole('slider', { name: HUE })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: SATURATION_AND_BRIGHTNESS })).toBeInTheDocument();
  });

  it('reads the saturation control by the code of the color, not by English text', () => {
    render(<HexColorCanvas color="#336699" onDraft={vi.fn()} />);

    expect(screen.getByRole('slider', { name: SATURATION_AND_BRIGHTNESS })).toHaveAttribute(
      'aria-valuetext',
      '#336699',
    );
  });

  it('an arrow on the hue control drafts the hex of the next hue', () => {
    const onDraft = vi.fn();
    render(<HexColorCanvas color="#336699" onDraft={onDraft} />);

    pressArrowRight(screen.getByRole('slider', { name: HUE }));

    expect(onDraft.mock.calls).toEqual([['#334799']]);
  });

  it('a new color from outside does not report back as a draft', () => {
    const onDraft = vi.fn();
    const { rerender } = render(<HexColorCanvas color="#336699" onDraft={onDraft} />);

    rerender(<HexColorCanvas color="#aabbcc" onDraft={onDraft} />);

    expect(onDraft).not.toHaveBeenCalled();
  });
});
