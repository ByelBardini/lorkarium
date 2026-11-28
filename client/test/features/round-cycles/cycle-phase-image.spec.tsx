import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CyclePhaseImage } from '@/features/round-cycles/cycle-phase-image';

const IMAGE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const cheia = {
  phaseId: 'p-cheia',
  name: 'Lua Cheia',
  icon: 'game-icons:cycle' as const,
  imageAssetId: IMAGE_ID,
};

describe('CyclePhaseImage', () => {
  it('a phase with an image shows it from the table assets', () => {
    const { container } = render(<CyclePhaseImage phase={cheia} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(`/api/assets/${IMAGE_ID}`);
  });

  it('an image that fails to load gives way to the icon of the phase', () => {
    const { container } = render(<CyclePhaseImage phase={cheia} />);
    const image = container.querySelector('img');
    if (!image) throw new Error('expected the image first');

    fireEvent.error(image);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-icon]')?.getAttribute('data-icon')).toBe(
      'game-icons:cycle',
    );
  });

  it('a phase without image shows its icon, not its name', () => {
    const { container } = render(
      <CyclePhaseImage
        phase={{
          phaseId: 'p-nova',
          name: 'Nova',
          icon: 'game-icons:moon-orbit' as const,
          imageAssetId: null,
        }}
      />,
    );
    const icon = container.querySelector('[data-icon]')?.getAttribute('data-icon');
    expect([container.querySelector('img'), icon, container.textContent]).toEqual([
      null,
      'game-icons:moon-orbit',
      '',
    ]);
  });
});
