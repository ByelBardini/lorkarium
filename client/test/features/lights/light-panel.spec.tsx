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
  it('shows the reach of a torch, 4 + 4 cells, as bright until "6" and dim until "12" m', () => {
    renderPanel();

    expect(screen.getByLabelText('Plena até (m)')).toHaveValue('6');
    expect(screen.getByLabelText('Penumbra até (m)')).toHaveValue('12');
  });

  it('bright until "9" m with the dim until 12 m kept gives a reach of 6 + 2 cells', async () => {
    const reaches = renderPanel();
    const bright = screen.getByLabelText('Plena até (m)');

    await userEvent.clear(bright);
    await userEvent.type(bright, '9');

    expect(reaches.at(-1)).toEqual({ bright: 6, dim: 2 });
  });

  it('"151" m is refused on the field and gives no reach', async () => {
    const reaches = renderPanel();
    const bright = screen.getByLabelText('Plena até (m)');

    await userEvent.clear(screen.getByLabelText('Penumbra até (m)'));
    await userEvent.clear(bright);
    await userEvent.type(bright, '151');

    expect(bright).toHaveAccessibleDescription('De 0 a 150 m.');
    expect(reaches.at(-1)).toEqual({ bright: 10, dim: 0 });
  });

  it('lights picked with different reaches show empty fields reading "vários"', () => {
    render(<LightPanel reach={null} distance={METERS} onReach={() => undefined} commit="blur" />);

    expect(screen.getByLabelText('Plena até (m)')).toHaveAttribute('placeholder', 'vários');
    expect(screen.getByLabelText('Plena até (m)')).toHaveValue('');
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
    const bright = screen.getByLabelText('Plena até (m)');

    await userEvent.clear(bright);
    await userEvent.type(bright, '6');
    expect(reaches).toEqual([]);
    await userEvent.tab();

    expect(reaches).toEqual([{ bright: 4, dim: 4 }]);
  });
});
