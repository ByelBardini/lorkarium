import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LightPanel } from '@/features/lights/light-panel';
import type { LightColor } from '@/lib/light-color';
import type { LightReach } from '@/services/light-commands';

const METERS = { cellDistance: 1.5, cellUnit: 'm' };

function renderPanel(): LightReach[] {
  const reaches: LightReach[] = [];
  render(
    <LightPanel
      reach={{ bright: 4, dim: 4 }}
      distance={METERS}
      onReach={(reach) => reaches.push(reach)}
      color={null}
      onColor={() => undefined}
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
    render(
      <LightPanel
        reach={null}
        distance={METERS}
        onReach={() => undefined}
        color={null}
        onColor={() => undefined}
        commit="blur"
      />,
    );

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
        color={null}
        onColor={() => undefined}
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

  describe('Abertura (°)', () => {
    function renderAngle(angle: number | null): number[] {
      const angles: number[] = [];
      render(
        <LightPanel
          reach={{ bright: 4, dim: 4 }}
          distance={METERS}
          onReach={() => undefined}
          color={null}
          onColor={() => undefined}
          angle={angle}
          onAngle={(chosen) => angles.push(chosen)}
          commit="blur"
        />,
      );
      return angles;
    }

    it('"60" is sent only on leaving the field, once', async () => {
      const angles = renderAngle(360);
      const field = screen.getByLabelText('Abertura (°)');

      await userEvent.clear(field);
      await userEvent.type(field, '60');
      expect(angles).toEqual([]);
      await userEvent.tab();

      expect(angles).toEqual([60]);
    });

    it('lights picked with different angles show an empty field reading "vários"', () => {
      renderAngle(null);

      expect(screen.getByLabelText('Abertura (°)')).toHaveAttribute('placeholder', 'vários');
      expect(screen.getByLabelText('Abertura (°)')).toHaveValue('');
    });

    it('"0" says so on the field and sends nothing', async () => {
      const angles = renderAngle(360);
      const field = screen.getByLabelText('Abertura (°)');

      await userEvent.clear(field);
      await userEvent.type(field, '0');
      await userEvent.tab();

      expect(field).toHaveAccessibleDescription('De 1 a 360°.');
      expect(angles).toEqual([]);
    });
  });

  describe('Cor da luz', () => {
    function renderColors(color: LightColor | undefined): LightColor[] {
      const colors: LightColor[] = [];
      render(
        <LightPanel
          reach={{ bright: 4, dim: 4 }}
          distance={METERS}
          onReach={() => undefined}
          color={color}
          onColor={(chosen) => colors.push(chosen)}
          commit="change"
        />,
      );
      return colors;
    }

    it('below the reach, offers Neutra and the seven colors, in the palette order', () => {
      renderColors(null);

      const group = screen.getByRole('radiogroup', { name: 'Cor da luz' });
      expect(
        within(group)
          .getAllByRole('radio')
          .map((tile) => tile.getAttribute('aria-label')),
      ).toEqual(['Neutra', 'Tocha', 'Vela', 'Fogo', 'Lua', 'Arcana', 'Necrótica', 'Infernal']);
    });

    it('clicking "Fogo" sends fire to onColor', async () => {
      const colors = renderColors(null);

      await userEvent.click(screen.getByRole('radio', { name: 'Fogo' }));

      expect(colors).toEqual(['fire']);
    });
  });
});
