import { describe, expect, it } from 'vitest';
import { conditionsAsListed, conditionsBySeverity, tokenLooksOf } from '@/lib/condition-order';
import { activeCondition } from '../support/table-session-fixtures';

const ABENCOADO = activeCondition({ id: 'abencoado', name: 'Abençoado', tone: 'benefit' });
const ENVENENADO = activeCondition({ id: 'envenenado', name: 'Envenenado', tone: 'harm' });
const PARALISADO = activeCondition({
  id: 'paralisado',
  name: 'Paralisado',
  tone: 'incapacitating',
});
const CEGO = activeCondition({ id: 'cego', name: 'Cego', tone: 'harm' });
const INVISIVEL = activeCondition({
  id: 'invisivel',
  name: 'Invisível',
  tone: 'benefit',
  look: 'invisible',
});

function names(list: readonly { name: string }[]): string[] {
  return list.map(({ name }) => name);
}

describe('conditionsBySeverity', () => {
  it('puts the incapacitating first, then the harms, then the benefits, keeping the order inside each', () => {
    const ordered = conditionsBySeverity([ABENCOADO, ENVENENADO, PARALISADO, CEGO]);
    expect(names(ordered)).toEqual(['Paralisado', 'Envenenado', 'Cego', 'Abençoado']);
  });

  it('no condition gives no condition', () => {
    expect(conditionsBySeverity([])).toEqual([]);
  });
});

describe('tokenLooksOf', () => {
  it('a condition with a look changes the token and leaves the marks', () => {
    const { looks, marks } = tokenLooksOf([INVISIVEL, ENVENENADO]);
    expect(looks).toEqual(['invisible']);
    expect(names(marks)).toEqual(['Envenenado']);
  });

  it('two conditions with the same look give it once', () => {
    const sumido = activeCondition({ id: 'sumido', name: 'Sumido', look: 'invisible' });
    expect(tokenLooksOf([INVISIVEL, sumido]).looks).toEqual(['invisible']);
  });

  it('the marks come out by severity', () => {
    const { marks } = tokenLooksOf([ABENCOADO, INVISIVEL, PARALISADO]);
    expect(names(marks)).toEqual(['Paralisado', 'Abençoado']);
  });
});

describe('conditionsAsListed', () => {
  it('lists the ones that change the token first, then the rest by severity', () => {
    const listed = conditionsAsListed([ABENCOADO, ENVENENADO, PARALISADO, INVISIVEL]);
    expect(names(listed)).toEqual(['Invisível', 'Paralisado', 'Envenenado', 'Abençoado']);
  });
});
