import { describe, expect, it } from 'vitest';
import {
  boardCommandFailureMessage,
  connectionStatusLine,
  movedAnnouncement,
  resizedAnnouncement,
  selectedAnnouncement,
  tokenCommandFailureMessage,
} from '@/features/board/board-messages';

describe('connectionStatusLine', () => {
  it.each([
    ['connecting', 'loading', 'Conectando à mesa…'],
    ['reconnecting', 'ready', 'Reconectando…'],
    ['live', 'loading', 'Carregando o tabuleiro…'],
    ['live', 'ready', ''],
    ['live', 'failed', ''],
    ['failed', 'loading', ''],
  ] as const)('presence %s with the board %s reads "%s"', (presence, board, line) => {
    expect(connectionStatusLine(presence, board)).toBe(line);
  });
});

describe('boardCommandFailureMessage', () => {
  it.each([
    ['forbidden', 'Só o mestre pode fazer isso.'],
    ['rate_limited', 'Muitas ações seguidas. Espere um instante.'],
    ['offline', 'Sem conexão com o servidor. Confira sua internet e tente de novo.'],
    ['stale_undo', 'Alguém mexeu nisso depois; não dá para desfazer.'],
    ['drawing_limit', 'A cena já tem desenhos demais. Apague alguns antes.'],
    ['drawing_not_found', 'Esse desenho não está mais na mesa.'],
  ] as const)('%s reads "%s"', (failure, message) => {
    expect(boardCommandFailureMessage(failure)).toBe(message);
  });
});

describe('tokenCommandFailureMessage', () => {
  it.each([
    ['forbidden', 'Esse token não é seu.'],
    ['out_of_scene', 'Fora da cena.'],
    ['turn_changed', 'A vez já passou.'],
    ['combat_active', 'Já há um combate nesta cena.'],
    ['rate_limited', 'Muitas ações seguidas. Espere um instante.'],
  ] as const)('%s reads "%s"', (failure, message) => {
    expect(tokenCommandFailureMessage(failure)).toBe(message);
  });
});

describe('announcements', () => {
  it('count cells from 1', () => {
    expect(selectedAnnouncement('Kael', 7, 5)).toBe('Kael selecionado, coluna 8, linha 6');
    expect(movedAnnouncement('Kael', 8, 5)).toBe('Kael foi para a coluna 9, linha 6');
  });
});

describe('resizedAnnouncement', () => {
  it('says the new sides in cells, with a comma for half a cell', () => {
    expect(resizedAnnouncement('Kael', { width: 2, height: 1.5 })).toBe(
      'Kael agora ocupa 2 × 1,5 casas.',
    );
  });
});
