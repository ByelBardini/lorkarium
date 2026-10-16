import { describe, expect, it } from 'vitest';
import { ConnectionTablesBo } from '../../../src/modules/sessions/connection-tables.bo';
import { QUELM_ID, VHARN_ID } from '../../support/campaigns-factories';

const OTHER_TABLES = [
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000004',
] as const;
const SIXTH_TABLE = 'a1000000-0000-4000-8000-000000000006';
const FOUR_OPEN: ReadonlySet<string> = new Set(OTHER_TABLES);
const FIVE_OPEN: ReadonlySet<string> = new Set([...OTHER_TABLES, VHARN_ID]);
const LIMIT = 5;

describe('ConnectionTablesBo.admit', () => {
  it('a connection with no table admits VHARN', () => {
    const outcome = new ConnectionTablesBo(new Set(), LIMIT).admit(VHARN_ID);
    expect(outcome.change).toBe('admitted');
    expect(outcome.tables).toEqual(new Set([VHARN_ID]));
  });

  it('a connection with 4 tables admits the 5th', () => {
    const outcome = new ConnectionTablesBo(FOUR_OPEN, LIMIT).admit(VHARN_ID);
    expect(outcome.change).toBe('admitted');
    expect(outcome.tables.size).toBe(5);
  });

  it('asking again for a table already open at the limit is already-open and keeps the set', () => {
    const outcome = new ConnectionTablesBo(FIVE_OPEN, LIMIT).admit(VHARN_ID);
    expect(outcome.change).toBe('already-open');
    expect(outcome.tables).toEqual(FIVE_OPEN);
  });

  it('a 6th table is refused with TOO_MANY_TABLES citing the id and the limit', () => {
    const admitSixth = (): unknown => new ConnectionTablesBo(FIVE_OPEN, LIMIT).admit(SIXTH_TABLE);
    expect(admitSixth).toThrow(
      expect.objectContaining({
        code: 'TOO_MANY_TABLES',
        message: expect.stringContaining(SIXTH_TABLE) as string,
      }),
    );
    expect(admitSixth).toThrow('5 of 5');
  });
});

describe('ConnectionTablesBo.release', () => {
  it('releasing an open table takes it out of the set', () => {
    const outcome = new ConnectionTablesBo(new Set([VHARN_ID, QUELM_ID]), LIMIT).release(VHARN_ID);
    expect(outcome.change).toBe('released');
    expect(outcome.tables).toEqual(new Set([QUELM_ID]));
  });

  it('releasing a table that is not open is not-open and keeps the set', () => {
    const open: ReadonlySet<string> = new Set([QUELM_ID]);
    const outcome = new ConnectionTablesBo(open, LIMIT).release(VHARN_ID);
    expect(outcome.change).toBe('not-open');
    expect(outcome.tables).toEqual(open);
  });
});

describe('ConnectionTablesBo immutability', () => {
  it('the set it was built from does not change after admit or release', () => {
    const open = new Set([QUELM_ID]);
    const tables = new ConnectionTablesBo(open, LIMIT);
    tables.admit(VHARN_ID);
    tables.release(QUELM_ID);
    expect(open).toEqual(new Set([QUELM_ID]));
  });
});
