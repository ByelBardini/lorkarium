import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { LightColorTiles } from '@/features/lights/light-color-tiles';
import type { LightColor } from '@/lib/light-color';

function renderTiles(value: LightColor | undefined): LightColor[] {
  const chosen: LightColor[] = [];
  render(<LightColorTiles value={value} onChange={(color) => chosen.push(color)} />);
  return chosen;
}

function checkedNames(): (string | null)[] {
  const group = screen.getByRole('radiogroup', { name: 'Cor da luz' });
  return within(group)
    .getAllByRole('radio')
    .filter((tile) => tile.getAttribute('aria-checked') === 'true')
    .map((tile) => tile.getAttribute('aria-label'));
}

describe('LightColorTiles', () => {
  it.each([
    [null, 'Neutra'],
    ['moon', 'Lua'],
  ] as const)('the color %s checks only "%s"', (color, label) => {
    renderTiles(color);

    expect(checkedNames()).toEqual([label]);
  });

  it('lights picked with different colors ("vários", undefined) check no tile', () => {
    renderTiles(undefined);

    expect(checkedNames()).toEqual([]);
  });

  it('a custom #336699 checks no palette tile and marks the custom tile', () => {
    renderTiles('#336699');

    expect(checkedNames()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Cor personalizada: #336699' })).toBeInTheDocument();
  });

  it('lights picked with different colors ("vários") offer the custom tile with no color on it', () => {
    renderTiles(undefined);

    expect(screen.getByRole('button', { name: 'Cor personalizada' })).toBeInTheDocument();
  });

  it('typing #336699 and "Usar cor" chooses the custom hex once', async () => {
    const chosen = renderTiles(null);

    await userEvent.click(screen.getByRole('button', { name: 'Cor personalizada' }));
    const code = await screen.findByLabelText('Código da cor');
    await userEvent.clear(code);
    await userEvent.type(code, '#336699');
    await userEvent.click(screen.getByRole('button', { name: 'Usar cor' }));

    expect(chosen).toEqual(['#336699']);
  });

  it('clicking "Neutra" from moon chooses neutral (null)', async () => {
    const chosen = renderTiles('moon');

    await userEvent.click(screen.getByRole('radio', { name: 'Neutra' }));

    expect(chosen).toEqual([null]);
  });

  it('clicking "Necrótica" from neutral chooses necrotic', async () => {
    const chosen = renderTiles(null);

    await userEvent.click(screen.getByRole('radio', { name: 'Necrótica' }));

    expect(chosen).toEqual(['necrotic']);
  });
});
