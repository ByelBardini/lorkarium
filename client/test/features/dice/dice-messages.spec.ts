import { DiceNotationError, parseDiceExpression, parseDiceParts } from '@lorkarium/game-core';
import { describe, expect, it } from 'vitest';
import {
  advantageHintOf,
  modeHintOf,
  notationMessageOf,
  revealAnnouncement,
  rollFailureMessage,
  savedRollFailureMessage,
  secretRollText,
} from '@/features/dice/dice-messages';

function errorOf(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof DiceNotationError) return error.message;
    throw error;
  }
  throw new Error('The notation was read: expected a DiceNotationError.');
}

describe('notationMessageOf', () => {
  it.each([
    ['', 'Escreva um dado ou um número.'],
    ['2d', 'Faltou o número de faces.'],
    ['1d6+', 'Faltou um dado ou um número depois do sinal.'],
    ['abc', 'Comece com um dado (como 1d20) ou um número.'],
    ['1d6 x', 'Separe os termos com + ou -.'],
    ['0d6', 'A quantidade de dados vai de 1 a 1000.'],
    ['1d1', 'Os dados têm de 2 a 1000 faces.'],
    ['6d6kh7', 'Mantenha de 1 até a quantidade de dados.'],
    ['4d6dl4', 'Descarte deixando pelo menos um dado.'],
    ['1d6kh1dl1', 'Use manter (k) ou descartar (d), não os dois.'],
    ['1d6!!', 'Cada modificador vale uma vez só.'],
    ['1d6!>=1', 'Essa explosão nunca pararia. Use um alvo que nem toda face alcance.'],
    ['1d6>=0', 'O alvo vai de 1 a 1000.'],
    ['10000', 'Os números vão de -9999 a 9999.'],
    ['1'.repeat(201), 'A rolagem passa de 200 caracteres.'],
  ])('"%s" reads as "%s"', (expression, expected) => {
    expect(notationMessageOf(errorOf(() => parseDiceExpression(expression)))).toBe(expected);
  });

  it('a part’s error keeps the category behind the part prefix', () => {
    const message = errorOf(() => parseDiceParts(['1d20', '2d']));
    expect(message).toMatch(/^Dice part 1/);
    expect(notationMessageOf(message)).toBe('Faltou o número de faces.');
  });

  it('the server’s refusal (part counted from 1) reads the same way', () => {
    const server =
      'part 2 ("2d") cannot be read: Expected the number of sides at position 2; got the end of the expression.';
    expect(notationMessageOf(server)).toBe('Faltou o número de faces.');
  });

  it('too many parts and too many dice', () => {
    const parts = errorOf(() => parseDiceParts(Array.from({ length: 11 }, () => '1d6')));
    expect(notationMessageOf(parts)).toBe('Até 10 peças por rolagem.');
    expect(notationMessageOf(errorOf(() => parseDiceParts(['600d6', '401d6'])))).toBe(
      'Até 1000 dados por rolagem.',
    );
  });

  it('an unknown sentence falls back to the general hint', () => {
    expect(notationMessageOf('Something else.')).toBe(
      'Não deu para ler a rolagem. Use algo como 1d20+5.',
    );
  });
});

describe('rollFailureMessage', () => {
  it('rate_limited cites the seconds', () => {
    expect(rollFailureMessage({ kind: 'rate_limited', retryAfterSeconds: 1 })).toBe(
      'Muitas rolagens seguidas. Espere 1 s.',
    );
  });

  it('invalid_expression translates the server’s notation error', () => {
    const message = 'Dice sides 1 at position 2 is invalid: expected 2 to 1000.';
    expect(rollFailureMessage({ kind: 'invalid_expression', message })).toBe(
      'Os dados têm de 2 a 1000 faces.',
    );
  });

  it('forbidden is the spectator’s', () => {
    expect(rollFailureMessage({ kind: 'forbidden' })).toBe('Quem assiste à mesa não rola dados.');
  });
});

describe('savedRollFailureMessage', () => {
  it.each([
    [{ kind: 'name_taken' } as const, 'Já existe uma rolagem com esse nome.'],
    [{ kind: 'limit' } as const, 'Você já tem 50 rolagens salvas. Apague uma para salvar outra.'],
    [{ kind: 'not_found' } as const, 'Essa rolagem salva não existe mais.'],
    [
      { kind: 'rate_limited', retryAfterSeconds: 12 } as const,
      'Muitas ações seguidas. Espere 12 s.',
    ],
  ])('%o → %s', (failure, expected) => {
    expect(savedRollFailureMessage(failure)).toBe(expected);
  });
});

describe('the history’s texts', () => {
  it('advantageHintOf speaks only of modified and too many dice', () => {
    expect(advantageHintOf('modified')).toMatch(/^O primeiro dado já tem modificador/);
    expect(advantageHintOf('too-many-dice')).toBe('Dados demais para somar mais um.');
    expect(advantageHintOf('no-dice')).toBeNull();
    expect(advantageHintOf(null)).toBeNull();
  });

  it('revealAnnouncement with and without a label', () => {
    expect(revealAnnouncement('Bia', 22, 'Acerto')).toBe('Bia rolou 22 (Acerto).');
    expect(revealAnnouncement('Bia', 7, null)).toBe('Bia rolou 7.');
  });

  it('a secret roll names who rolled and nothing else', () => {
    expect(secretRollText('Bia')).toBe('Bia rolou em segredo.');
  });
});

describe('modeHintOf', () => {
  it('advantage keeps the highest, disadvantage the lowest, normal says nothing', () => {
    expect(modeHintOf('advantage')).toBe('Rola um dado a mais e fica com o maior.');
    expect(modeHintOf('disadvantage')).toBe('Rola um dado a mais e fica com o menor.');
    expect(modeHintOf('normal')).toBeNull();
  });
});
