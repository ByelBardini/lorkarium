import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CycleAudienceFields } from '@/features/round-cycles/cycle-audience-fields';
import { NEW_CYCLE_DRAFT, type RoundCycleDraft } from '@/lib/round-cycle-form';

const PLAYERS = [
  { userId: 'user-bia', name: 'Bia' },
  { userId: 'user-caio', name: 'Caio' },
];

function renderFields(draft: RoundCycleDraft): RoundCycleDraft[] {
  const changes: RoundCycleDraft[] = [];
  render(
    <CycleAudienceFields draft={draft} players={PLAYERS} onChange={(next) => changes.push(next)} />,
  );
  return changes;
}

describe('CycleAudienceFields', () => {
  it('the player list of who sees shows only for "Só alguns jogadores"', () => {
    renderFields(NEW_CYCLE_DRAFT);
    expect(screen.queryByRole('group', { name: 'Jogadores que veem' })).not.toBeInTheDocument();
  });

  it('marking Caio as chooser makes him see too', async () => {
    const changes = renderFields({ ...NEW_CYCLE_DRAFT, visibility: 'some' });
    const choosers = screen.getByRole('group', { name: /Quem pode escolher/ });

    await userEvent.click(choosers.querySelectorAll('button[role="checkbox"]')[1] as HTMLElement);

    expect(changes.at(-1)).toMatchObject({ seerIds: ['user-caio'], chooserIds: ['user-caio'] });
  });

  it('picking "Só o mestre" changes the visibility', async () => {
    const changes = renderFields(NEW_CYCLE_DRAFT);
    await userEvent.click(screen.getByLabelText(/Só o mestre/));
    expect(changes.at(-1)?.visibility).toBe('masters');
  });
});
