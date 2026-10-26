/** The technical ceilings of a roll: they protect the server, not a product rule. `maxDice` sums
 *  every part of a roll; `maxExplosions` counts the extra dice exploded in the whole roll. */
export const DICE_LIMITS = Object.freeze({
  maxDice: 1000,
  minSides: 2,
  maxSides: 1000,
  maxExplosions: 100,
  maxNumber: 9999,
  maxLength: 200,
});

export type DiceSign = 1 | -1;
export type DiceComparisonOp = '=' | '>' | '>=' | '<' | '<=';

export interface DiceComparison {
  readonly op: DiceComparisonOp;
  readonly target: number;
}

export interface DiceSelection {
  readonly which: 'highest' | 'lowest';
  readonly count: number;
}

export interface DiceTerm {
  readonly kind: 'dice';
  readonly sign: DiceSign;
  readonly count: number;
  readonly sides: number;
  readonly keep?: DiceSelection;
  readonly drop?: DiceSelection;
  readonly explode?: DiceComparison;
  readonly reroll?: DiceComparison;
  readonly success?: DiceComparison;
}

export interface NumberTerm {
  readonly kind: 'number';
  readonly sign: DiceSign;
  readonly value: number;
}

export type DiceExpressionTerm = DiceTerm | NumberTerm;

/** A notation the parser refuses: `position` is the character where reading stopped, `part` the
 *  index of the roll part when the error came from `parseDiceParts` (null for one expression). */
export class DiceNotationError extends RangeError {
  readonly position: number;
  readonly part: number | null;

  constructor(message: string, position: number, part: number | null = null) {
    super(message);
    this.name = 'DiceNotationError';
    this.position = position;
    this.part = part;
  }
}

type DiceModifiers = {
  -readonly [K in 'keep' | 'drop' | 'explode' | 'reroll' | 'success']?: DiceTerm[K];
};

type ParsedModifier =
  | { kind: 'selection'; name: 'keep' | 'drop'; value: DiceSelection; position: number }
  | {
      kind: 'comparison';
      name: 'explode' | 'reroll' | 'success';
      value: DiceComparison;
      position: number;
    };

interface DieShape {
  readonly count: number;
  readonly sides: number;
}

interface Cursor {
  readonly source: string;
  readonly text: string;
  pos: number;
}

const MODIFIER_STARTS = new Set(['k', 'd', '!', 'r', '>', '<', '=']);

/** Reads a dice notation (`2d20kh1+5`, `4d6dl1`, `1d6!`, `8d10>=7`, `d%`) into terms that sum.
 *  Dice modifiers bind tighter than the arithmetic: `4d10dl2+2` is `(4d10dl2)+2`.
 *
 *  Example: `parseDiceExpression('1d20+5')` → `[{ kind: 'dice', sign: 1, count: 1, sides: 20 }, { kind: 'number', sign: 1, value: 5 }]` */
export function parseDiceExpression(text: string): DiceExpressionTerm[] {
  checkLength(text);
  const cursor: Cursor = { source: text, text: text.toLowerCase(), pos: 0 };
  skipSpaces(cursor);
  if (atEnd(cursor)) {
    throw new DiceNotationError('Dice expression is empty: expected a die or a number.', 0);
  }
  const terms = [readSignedTerm(cursor, true)];
  for (skipSpaces(cursor); !atEnd(cursor); skipSpaces(cursor)) {
    terms.push(readSignedTerm(cursor, false));
  }
  return terms;
}

/** Writes terms back in the canonical notation (lowercase, no spaces, `d%` as `d100`); reading the
 *  result gives the same terms.
 *
 *  Example: `formatDiceExpression(parseDiceExpression(' 2D20KH1 + 5 '))` → `'2d20kh1+5'` */
export function formatDiceExpression(terms: readonly DiceExpressionTerm[]): string {
  return terms.map((term, index) => signText(term.sign, index === 0) + termText(term)).join('');
}

/** Whether a die value meets a comparison (explosion, reroll or success).
 *
 *  Example: `diceComparisonMatches({ op: '>=', target: 7 }, 9)` → `true` */
export function diceComparisonMatches(comparison: DiceComparison, value: number): boolean {
  const { op, target } = comparison;
  if (op === '=') return value === target;
  if (op === '>') return value > target;
  if (op === '>=') return value >= target;
  if (op === '<') return value < target;
  return value <= target;
}

function checkLength(text: string): void {
  if (text.length <= DICE_LIMITS.maxLength) return;
  throw new DiceNotationError(
    `Dice expression has ${text.length} characters: expected at most ${DICE_LIMITS.maxLength}.`,
    DICE_LIMITS.maxLength,
  );
}

function readSignedTerm(cursor: Cursor, first: boolean): DiceExpressionTerm {
  const signChar = peek(cursor);
  const hasSign = signChar === '+' || signChar === '-';
  if (!hasSign && !first) throw expectedAt(cursor, "'+' or '-'");
  if (hasSign) cursor.pos += 1;
  skipSpaces(cursor);
  const sign: DiceSign = signChar === '-' ? -1 : 1;
  return readTerm(cursor, sign, hasSign ? ` after '${signChar}'` : '');
}

function readTerm(cursor: Cursor, sign: DiceSign, context: string): DiceExpressionTerm {
  const start = cursor.pos;
  const digits = readDigits(cursor);
  if (peek(cursor) === 'd') return readDiceTerm(cursor, sign, digits ?? '1', start);
  if (digits === null) throw expectedAt(cursor, `a die or a number${context}`);
  return numberTerm(sign, digits, start);
}

function numberTerm(sign: DiceSign, digits: string, start: number): NumberTerm {
  const value = Number(digits);
  if (value <= DICE_LIMITS.maxNumber) return { kind: 'number', sign, value };
  const max = DICE_LIMITS.maxNumber;
  throw new DiceNotationError(
    `Number ${sign === -1 ? '-' : ''}${digits} at position ${start} is out of range: expected -${max} to ${max}.`,
    start,
  );
}

function readDiceTerm(
  cursor: Cursor,
  sign: DiceSign,
  countDigits: string,
  start: number,
): DiceTerm {
  const count = checkedRange('Dice count', countDigits, start, 1, DICE_LIMITS.maxDice);
  cursor.pos += 1;
  const sides = readSides(cursor);
  const modifiers = readModifiers(cursor, { count, sides });
  return { kind: 'dice', sign, count, sides, ...modifiers };
}

function readSides(cursor: Cursor): number {
  const start = cursor.pos;
  if (peek(cursor) === '%') {
    cursor.pos += 1;
    return 100;
  }
  const digits = readDigits(cursor);
  if (digits === null) throw expectedAt(cursor, 'the number of sides');
  return checkedRange('Dice sides', digits, start, DICE_LIMITS.minSides, DICE_LIMITS.maxSides);
}

function readModifiers(cursor: Cursor, die: DieShape): DiceModifiers {
  const modifiers: DiceModifiers = {};
  while (MODIFIER_STARTS.has(peek(cursor))) {
    checkModifierFree(modifiers, modifierNameAt(cursor), cursor.pos);
    addModifier(modifiers, readModifier(cursor, die));
  }
  return modifiers;
}

function modifierNameAt(cursor: Cursor): ParsedModifier['name'] {
  const names: Record<string, ParsedModifier['name']> = {
    k: 'keep',
    d: 'drop',
    '!': 'explode',
    r: 'reroll',
  };
  return names[peek(cursor)] ?? 'success';
}

function addModifier(modifiers: DiceModifiers, modifier: ParsedModifier): void {
  if (modifier.kind === 'selection') modifiers[modifier.name] = modifier.value;
  else modifiers[modifier.name] = modifier.value;
}

function checkModifierFree(
  modifiers: DiceModifiers,
  name: ParsedModifier['name'],
  position: number,
): void {
  if (modifiers[name] !== undefined) {
    throw new DiceNotationError(
      `Modifier '${name}' appears twice at position ${position}: expected it at most once.`,
      position,
    );
  }
  if ((name === 'keep' && modifiers.drop) || (name === 'drop' && modifiers.keep)) {
    throw new DiceNotationError(
      `Keep and drop together at position ${position}: expected only one of them.`,
      position,
    );
  }
}

function readModifier(cursor: Cursor, die: DieShape): ParsedModifier {
  const position = cursor.pos;
  const char = peek(cursor);
  if (char === 'k' || char === 'd') return readSelection(cursor, die);
  if (char === '!') return readExplosion(cursor, die);
  if (char === 'r') {
    cursor.pos += 1;
    const value = readComparison(cursor, { op: '=', target: 1 });
    return { kind: 'comparison', name: 'reroll', value, position };
  }
  const value = readComparison(cursor, null);
  return { kind: 'comparison', name: 'success', value, position };
}

function readSelection(cursor: Cursor, die: DieShape): ParsedModifier {
  const position = cursor.pos;
  const name = peek(cursor) === 'k' ? 'keep' : 'drop';
  cursor.pos += 1;
  const which = readWhich(cursor, name);
  const digits = readDigits(cursor) ?? '1';
  const count = Number(digits);
  const max = name === 'keep' ? die.count : die.count - 1;
  if (count >= 1 && count <= max) {
    return { kind: 'selection', name, value: { which, count }, position };
  }
  throw new DiceNotationError(selectionMessage(name, digits, position, die.count), position);
}

function readWhich(cursor: Cursor, name: 'keep' | 'drop'): DiceSelection['which'] {
  const char = peek(cursor);
  if (char === 'h' || char === 'l') {
    cursor.pos += 1;
    return char === 'h' ? 'highest' : 'lowest';
  }
  if (name === 'keep') return 'highest';
  throw expectedAt(cursor, "'h' or 'l' after 'd'");
}

function selectionMessage(name: 'keep' | 'drop', digits: string, at: number, dice: number): string {
  if (name === 'keep') {
    return `Keep ${digits} at position ${at} on ${dice} dice is invalid: expected at least 1 and at most ${dice}.`;
  }
  return `Drop ${digits} at position ${at} on ${dice} dice is invalid: expected at least 1 and at most ${dice - 1} (one die must stay).`;
}

function readExplosion(cursor: Cursor, die: DieShape): ParsedModifier {
  const position = cursor.pos;
  cursor.pos += 1;
  const value = readComparison(cursor, { op: '=', target: die.sides });
  if (!alwaysMatches(value, die.sides)) {
    return { kind: 'comparison', name: 'explode', value, position };
  }
  throw new DiceNotationError(
    `Explosion '!${value.op}${value.target}' at position ${position} on d${die.sides} always explodes: expected ${explosionHint(value.op, die.sides)}.`,
    position,
  );
}

function alwaysMatches(comparison: DiceComparison, sides: number): boolean {
  for (let face = 1; face <= sides; face += 1) {
    if (!diceComparisonMatches(comparison, face)) return false;
  }
  return true;
}

function explosionHint(op: DiceComparisonOp, sides: number): string {
  const hints: Record<DiceComparisonOp, string> = {
    '>=': 'a target above 1',
    '>': 'a target of at least 1',
    '<=': `a target below ${sides}`,
    '<': `a target of at most ${sides}`,
    '=': 'a face of the die',
  };
  return hints[op];
}

function readComparison(cursor: Cursor, fallback: DiceComparison | null): DiceComparison {
  const op = readOp(cursor);
  const start = cursor.pos;
  const digits = readDigits(cursor);
  if (digits !== null) {
    const target = checkedRange('Target', digits, start, 1, DICE_LIMITS.maxSides);
    return { op: op ?? '=', target };
  }
  if (op === null && fallback !== null) return fallback;
  throw expectedAt(cursor, 'a target number');
}

function readOp(cursor: Cursor): DiceComparisonOp | null {
  const two = cursor.text.slice(cursor.pos, cursor.pos + 2);
  if (two === '>=' || two === '<=') {
    cursor.pos += 2;
    return two;
  }
  const one = peek(cursor);
  if (one !== '>' && one !== '<' && one !== '=') return null;
  cursor.pos += 1;
  return one;
}

function checkedRange(what: string, digits: string, at: number, min: number, max: number): number {
  const value = Number(digits);
  if (value >= min && value <= max) return value;
  throw new DiceNotationError(
    `${what} ${digits} at position ${at} is invalid: expected ${min} to ${max}.`,
    at,
  );
}

function readDigits(cursor: Cursor): string | null {
  const match = /^\d+/.exec(cursor.text.slice(cursor.pos));
  if (match === null) return null;
  cursor.pos += match[0].length;
  return match[0];
}

function skipSpaces(cursor: Cursor): void {
  while (peek(cursor) === ' ' || peek(cursor) === '\t') cursor.pos += 1;
}

function peek(cursor: Cursor): string {
  return cursor.text.charAt(cursor.pos);
}

function atEnd(cursor: Cursor): boolean {
  return cursor.pos >= cursor.text.length;
}

function expectedAt(cursor: Cursor, expected: string): DiceNotationError {
  const got = atEnd(cursor) ? 'the end of the expression' : `'${cursor.source.charAt(cursor.pos)}'`;
  return new DiceNotationError(
    `Expected ${expected} at position ${cursor.pos}; got ${got}.`,
    cursor.pos,
  );
}

function signText(sign: DiceSign, first: boolean): string {
  if (sign === -1) return '-';
  return first ? '' : '+';
}

function termText(term: DiceExpressionTerm): string {
  if (term.kind === 'number') return String(term.value);
  const beforeSuccess = term.reroll === undefined && term.success !== undefined;
  const explode = term.explode && explosionText(term.explode, term.sides, beforeSuccess);
  return [
    `${term.count}d${term.sides}`,
    term.keep && selectionText('k', term.keep),
    term.drop && selectionText('d', term.drop),
    explode,
    term.reroll && `r${bareComparisonText(term.reroll)}`,
    term.success && `${term.success.op}${term.success.target}`,
  ].join('');
}

function selectionText(letter: 'k' | 'd', selection: DiceSelection): string {
  return `${letter}${selection.which === 'highest' ? 'h' : 'l'}${selection.count}`;
}

// A bare '!' reads the comparison right after it as its own: before a success it writes the face.
function explosionText(explode: DiceComparison, sides: number, beforeSuccess: boolean): string {
  if (explode.op === '=' && explode.target === sides && !beforeSuccess) return '!';
  return `!${bareComparisonText(explode)}`;
}

function bareComparisonText(comparison: DiceComparison): string {
  return comparison.op === '=' ? String(comparison.target) : `${comparison.op}${comparison.target}`;
}
