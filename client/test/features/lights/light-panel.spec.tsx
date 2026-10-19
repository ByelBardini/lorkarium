import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LightPanel } from '@/features/lights/light-panel';
import type { LightReach } from '@/services/light-commands';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

function renderPanel(): LightReach[] {
  const reaches: LightReach[] = [];
  render(
    <LightPanel
      reach={{ bright: 4, dim: 4 }}
      distance={METERS}
      onReach={(reach) => reaches.push(reach)}
      commit="change"
    />,
  );
  return reaches;
}

describe('LightPanel', () => {
  it('shows the reach of a torch, 4 and 4 cells, as "6" and "6" m', () => {
    renderPanel();

    expect(screen.getByLabelText('Plena (m)')).toHaveValue('6');
    expect(screen.getByLabelText('Penumbra (m)')).toHaveValue('6');
  });

  it('"9" m of bright light gives a reach of 6 cells, the dim kept', async () => {
    const reaches = renderPanel();
    const bright = screen.getByLabelText('Plena (m)');

    await userEvent.clear(bright);
    await userEvent.type(bright, '9');

    expect(reaches.at(-1)).toEqual({ bright: 6, dim: 4 });
  });

  it('"151" m is refused on the field and gives no reach', async () => {
    const reaches = renderPanel();
    const bright = screen.getByLabelText('Plena (m)');

    await userEvent.clear(bright);
    await userEvent.type(bright, '151');

    expect(bright).toHaveAccessibleDescription('De 0 a 150 m.');
    expect(reaches.at(-1)).toEqual({ bright: 10, dim: 4 });
  });

  it('lights picked with different reaches show empty fields reading "vários"', () => {
    render(<LightPanel reach={null} distance={METERS} onReach={() => undefined} commit="blur" />);

    expect(screen.getByLabelText('Plena (m)')).toHaveAttribute('placeholder', 'vários');
    expect(screen.getByLabelText('Plena (m)')).toHaveValue('');
  });

  it('with commit on leaving, typing sends nothing until the field is left, then once', async () => {
    const reaches: LightReach[] = [];
    render(
      <LightPanel
        reach={{ bright: 2, dim: 6 }}
        distance={METERS}
        onReach={(reach) => reaches.push(reach)}
        commit="blur"
      />,
    );
    const bright = screen.getByLabelText('Plena (m)');

    await userEvent.clear(bright);
    await userEvent.type(bright, '12');
    expect(reaches).toEqual([]);
    await userEvent.tab();

    expect(reaches).toEqual([{ bright: 8, dim: 6 }]);
  });
});
