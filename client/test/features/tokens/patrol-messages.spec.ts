import { describe, expect, it } from 'vitest';
import {
  PATROL_POINTS_FULL,
  patrolFailureMessage,
  patrolPanelTitle,
  patrolsSwitchedAnnouncement,
} from '@/features/tokens/patrol-messages';

describe('patrol messages', () => {
  it('the ceiling of a route reads "Até 32 pontos."', () => {
    expect(PATROL_POINTS_FULL).toBe('Até 32 pontos.');
  });

  it('the panel is named after the token', () => {
    expect(patrolPanelTitle('Kael')).toBe('Patrulha de Kael');
  });

  it('a route off the scene speaks of the size of the token', () => {
    expect(patrolFailureMessage('out_of_scene')).toBe(
      'Um ponto da rota sai da cena para este tamanho de token.',
    );
  });

  it.each([
    ['invalid_token_patrol', 'A rota precisa sair da casa do token.'],
    ['token_patrol_limit', 'Este grid já tem 30 patrulhas ligadas.'],
    ['forbidden', 'Só o mestre pode fazer isso.'],
  ] as const)('%s reads as the board says: %s', (failure, message) => {
    expect(patrolFailureMessage(failure)).toBe(message);
  });

  it.each([
    [['Kael'], true, 'Kael patrulhando.'],
    [['Kael'], false, 'Kael parado.'],
    [['Kael', 'Lyra'], true, '2 tokens patrulhando.'],
    [['Kael', 'Lyra'], false, '2 tokens parados.'],
  ])('%j switched to %s says "%s"', (names, active, said) => {
    expect(patrolsSwitchedAnnouncement(names, active)).toBe(said);
  });
});
