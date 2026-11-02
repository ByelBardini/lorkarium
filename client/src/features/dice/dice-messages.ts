import { SAVED_ROLL_FOLDERS_MAX, SAVED_ROLLS_MAX } from '@lorkarium/contracts';
import type { DiceRollFailure } from '@/services/dice-commands';
import type { SavedRollsFailure } from '@/services/saved-rolls-api';
import type { AdvantageMode } from '@lorkarium/game-core';
import type { DiceRollMode, TrayAdvantageBlock } from '@/lib/dice-tray';
import {
  INVALID_MESSAGE,
  NOT_MEMBER_MESSAGE,
  OFFLINE_MESSAGE,
  UNEXPECTED_MESSAGE,
} from '@/features/campaigns/campaign-messages';

const UNREADABLE_NOTATION = 'Não deu para ler a rolagem. Use algo como 1d20+5.';

// The game-core's notation errors are English sentences that cite the value; the screen speaks
// by category. The order matters: the specific "after '+'" before the generic "a die or a number".
const NOTATION_MESSAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/is empty/, 'Escreva um dado ou um número.'],
  [/has \d+ characters/, 'A rolagem passa de 200 caracteres.'],
  [/Dice roll has \d+ parts/, 'Até 10 peças por rolagem.'],
  [/Dice roll has \d+ dice/, 'Até 1000 dados por rolagem.'],
  [/the number of sides/, 'Faltou o número de faces.'],
  [/a die or a number after/, 'Faltou um dado ou um número depois do sinal.'],
  [/Expected a die or a number/, 'Comece com um dado (como 1d20) ou um número.'],
  [/Expected '\+' or '-'/, 'Separe os termos com + ou -.'],
  [/Expected 'h' or 'l'/, 'Depois do d, use h ou l (como dl1).'],
  [/a target number/, 'Faltou o número do alvo.'],
  [/Dice count/, 'A quantidade de dados vai de 1 a 1000.'],
  [/Dice sides/, 'Os dados têm de 2 a 1000 faces.'],
  [/Keep and drop together/, 'Use manter (k) ou descartar (d), não os dois.'],
  [/^(?:.*: )?Keep \d+/, 'Mantenha de 1 até a quantidade de dados.'],
  [/^(?:.*: )?Drop \d+/, 'Descarte deixando pelo menos um dado.'],
  [/appears twice/, 'Cada modificador vale uma vez só.'],
  [/always explodes/, 'Essa explosão nunca pararia. Use um alvo que nem toda face alcance.'],
  [/Target \d+/, 'O alvo vai de 1 a 1000.'],
  [/out of range/, 'Os números vão de -9999 a 9999.'],
];

/** A notation error (the game-core's or the server's, in English) in pt-BR, by category.
 *
 *  Example: `notationMessageOf("Expected the number of sides at position 2; got the end of the expression.") // 'Faltou o número de faces.'` */
export function notationMessageOf(message: string): string {
  const found = NOTATION_MESSAGES.find(([pattern]) => pattern.test(message));
  return found?.[1] ?? UNREADABLE_NOTATION;
}

const COMMON_FAILURES: Readonly<
  Record<
    'forbidden' | 'not_found' | 'invalid' | 'unauthenticated' | 'offline' | 'unexpected',
    string
  >
> = {
  forbidden: 'Quem assiste à mesa não rola dados.',
  not_found: NOT_MEMBER_MESSAGE,
  invalid: INVALID_MESSAGE,
  unauthenticated: 'Sua sessão terminou. Entre de novo para rolar.',
  offline: OFFLINE_MESSAGE,
  unexpected: UNEXPECTED_MESSAGE,
};

/** The refusal of a roll, in pt-BR.
 *
 *  Example: `rollFailureMessage({ kind: 'rate_limited', retryAfterSeconds: 1 }) // 'Muitas rolagens seguidas. Espere 1 s.'` */
export function rollFailureMessage(failure: DiceRollFailure): string {
  if (failure.kind === 'rate_limited') {
    return `Muitas rolagens seguidas. Espere ${failure.retryAfterSeconds} s.`;
  }
  if (failure.kind === 'invalid_expression') return notationMessageOf(failure.message);
  return COMMON_FAILURES[failure.kind];
}

const SAVED_ROLL_FAILURES: Readonly<
  Record<Exclude<SavedRollsFailure['kind'], 'rate_limited'>, string>
> = {
  ...COMMON_FAILURES,
  name_taken: 'Já existe uma rolagem com esse nome.',
  limit: `Você já tem ${SAVED_ROLLS_MAX} rolagens salvas. Apague uma para salvar outra.`,
  invalid_expression: 'Essa rolagem não pode ser salva: confira a notação.',
  not_found: 'Essa rolagem salva não existe mais.',
  folder_name_taken: 'Já existe uma pasta com esse nome.',
  folder_limit: `Você já tem ${SAVED_ROLL_FOLDERS_MAX} pastas. Apague uma para criar outra.`,
  folder_not_found: 'Essa pasta não existe mais.',
};

/** The refusal of a saved-roll call, in pt-BR.
 *
 *  Example: `savedRollFailureMessage({ kind: 'name_taken' }) // 'Já existe uma rolagem com esse nome.'` */
export function savedRollFailureMessage(failure: SavedRollsFailure): string {
  if (failure.kind === 'rate_limited') {
    return `Muitas ações seguidas. Espere ${failure.retryAfterSeconds} s.`;
  }
  return SAVED_ROLL_FAILURES[failure.kind];
}

/** What a saved-roll action leaves under the list: its refusal, or nothing when it worked.
 *
 *  Example: `setProblem(savedRollProblemOf(await saved.remove(id)))` */
export function savedRollProblemOf(
  result: Readonly<{ ok: true } | { ok: false; failure: SavedRollsFailure }>,
): string | null {
  return result.ok ? null : savedRollFailureMessage(result.failure);
}

/** Why "Vantagem" and "Desvantagem" are off, or `null` when there is nothing worth saying (an
 *  empty tray, or a notation whose own error already shows).
 *
 *  Example: `advantageHintOf('modified') // 'O primeiro dado já tem modificador…'` */
export function advantageHintOf(block: TrayAdvantageBlock | null): string | null {
  if (block === 'modified') {
    return 'O primeiro dado já tem modificador (k, d, !, r ou sucesso): vantagem não se aplica.';
  }
  if (block === 'too-many-dice') return 'Dados demais para somar mais um.';
  return null;
}

const MODE_HINTS: Readonly<Record<AdvantageMode, string>> = {
  advantage: 'Rola um dado a mais e fica com o maior.',
  disadvantage: 'Rola um dado a mais e fica com o menor.',
};

/** What the chosen mode does to the roll, under the segments; `null` for a plain roll.
 *
 *  Example: `modeHintOf('advantage') // 'Rola um dado a mais e fica com o maior.'` */
export function modeHintOf(mode: DiceRollMode): string | null {
  return mode === 'normal' ? null : MODE_HINTS[mode];
}

/** The notice of a masters-only roll to those who may not see it.
 *
 *  Example: `secretRollText('Bia') // 'Bia rolou em segredo.'` */
export function secretRollText(name: string): string {
  return `${name} rolou em segredo.`;
}

/** What the screen reader hears when a roll reveals.
 *
 *  Example: `revealAnnouncement('Bia', 22, 'Acerto') // 'Bia rolou 22 (Acerto).'` */
export function revealAnnouncement(name: string, total: number, label: string | null): string {
  return label === null ? `${name} rolou ${total}.` : `${name} rolou ${total} (${label}).`;
}

/** Who rolled when the roster no longer has them. */
export const UNKNOWN_ROLLER = 'Alguém';
