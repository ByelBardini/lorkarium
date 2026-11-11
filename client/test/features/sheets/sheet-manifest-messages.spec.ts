import { describe, expect, it } from 'vitest';
import {
  sheetManifestBarsLabel,
  sheetManifestPermissionLabel,
  sheetManifestProblemMessage,
} from '@/features/sheets/sheet-manifest-messages';

describe('sheet manifest messages', () => {
  it.each([
    ['character:stats', 'Gravar CA e CD do personagem'],
    ['character:portrait', 'Trocar o retrato'],
    ['sheet:images', 'Enviar imagens'],
    ['documents:read', 'Ler os documentos públicos da mesa'],
    ['character:bars', 'Criar barras no personagem'],
  ] as const)('the permission %s reads "%s"', (permission, words) =>
    expect(sheetManifestPermissionLabel(permission)).toBe(words),
  );

  it('the bars read as labels with their maximum, and none is null', () => {
    const bars = [
      { label: 'HP', color: 'ember' as const, max: 12 },
      { label: 'MP', color: 'steel' as const, max: 6 },
    ];
    expect(sheetManifestBarsLabel({ permissions: [], bars, assets: [] })).toBe(
      'HP (até 12), MP (até 6)',
    );
    expect(sheetManifestBarsLabel({ permissions: [], bars: [], assets: [] })).toBeNull();
  });

  it('a text that is not JSON and a contract refusal are worded apart', () => {
    expect(sheetManifestProblemMessage({ kind: 'not_json' })).toBe(
      'Manifesto inválido: o texto não é um JSON.',
    );
    expect(sheetManifestProblemMessage({ kind: 'invalid', detail: 'bars: bars has 9' })).toBe(
      'Manifesto inválido: bars: bars has 9',
    );
  });
});
