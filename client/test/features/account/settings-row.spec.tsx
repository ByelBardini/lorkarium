import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsRow, SettingsRowPair } from '@/features/account/settings-row';

describe('SettingsRow', () => {
  it('titleFor makes the title the label of the control, with the description beside', () => {
    render(
      <SettingsRow title="Apelido" titleFor="nick" description="Aparece nas mesas.">
        <input id="nick" />
      </SettingsRow>,
    );
    expect(screen.getByRole('textbox', { name: 'Apelido' })).toBeInTheDocument();
    expect(screen.getByText('Aparece nas mesas.')).toBeInTheDocument();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('group names the whole row after the title and carries aria-busy', () => {
    render(
      <SettingsRow title="Foto" group busy>
        <button type="button">Escolher foto</button>
      </SettingsRow>,
    );
    const row = screen.getByRole('group', { name: 'Foto' });
    expect(row).toHaveAttribute('aria-busy', 'true');
    expect(row).toContainElement(screen.getByRole('button', { name: 'Escolher foto' }));
  });

  it('SettingsRowPair holds two stacked rows, each still a group named by its title', () => {
    render(
      <SettingsRowPair>
        <SettingsRow title="Foto" group stacked>
          <button type="button">Escolher foto</button>
        </SettingsRow>
        <SettingsRow title="Banner" group stacked>
          <button type="button">Escolher imagem</button>
        </SettingsRow>
      </SettingsRowPair>,
    );
    const photo = screen.getByRole('group', { name: 'Foto' });
    const banner = screen.getByRole('group', { name: 'Banner' });
    expect(photo.parentElement).toBe(banner.parentElement);
    expect(photo.parentElement).toHaveClass('md:grid-cols-2');
    expect(photo).not.toHaveClass('border-t');
    expect(banner).toContainElement(screen.getByRole('button', { name: 'Escolher imagem' }));
  });

  it('titleId and descriptionId let a control name and describe itself by them', () => {
    render(
      <SettingsRow title="Sua cor" titleId="t" descriptionId="d" description="Pinta o ping.">
        <div role="radiogroup" aria-labelledby="t" aria-describedby="d" />
      </SettingsRow>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Sua cor' })).toHaveAccessibleDescription(
      'Pinta o ping.',
    );
  });
});
