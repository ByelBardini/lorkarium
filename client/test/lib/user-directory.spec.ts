import { describe, expect, it } from 'vitest';
import {
  directoryRows,
  filterDirectory,
  filtersOf,
  lastAccessLabel,
  statusCounts,
  type DirectoryFilters,
} from '@/lib/user-directory';
import { TEST_NOW } from '../support/app-dependencies';
import {
  bia,
  joaoExpired,
  lucasAdmin,
  marinaInvited,
  pedroSuspended,
} from '../support/user-admin-api-fake';

const DIRECTORY = {
  users: [lucasAdmin(TEST_NOW), bia(TEST_NOW), pedroSuspended(TEST_NOW)],
  invitations: [marinaInvited(TEST_NOW), joaoExpired(TEST_NOW)],
};
const ROWS = directoryRows(DIRECTORY, TEST_NOW);
const ALL: DirectoryFilters = { query: '', status: 'all', role: 'all' };

function idsOf(filters: Partial<DirectoryFilters>): string[] {
  return filterDirectory(ROWS, { ...ALL, ...filters }).map((row) =>
    row.kind === 'user' ? row.user.username : row.invitation.email,
  );
}

describe('directoryRows', () => {
  it('puts accounts and invitations together, the newest first', () => {
    expect(ROWS.map((row) => row.id)).toEqual([
      marinaInvited(TEST_NOW).id,
      joaoExpired(TEST_NOW).id,
      bia(TEST_NOW).id,
      pedroSuspended(TEST_NOW).id,
      lucasAdmin(TEST_NOW).id,
    ]);
  });

  it('an invitation past its deadline is invite-expired; a live one invited', () => {
    expect(ROWS.slice(0, 2).map((row) => row.status)).toEqual(['invited', 'invite-expired']);
  });
});

describe('filterDirectory', () => {
  it('finds by nickname, @ or e-mail without accent nor case', () => {
    expect(idsOf({ query: 'BIA' })).toEqual(['biaflor']);
    expect(idsOf({ query: '@pedrinho' })).toEqual(['pedrinho']);
    expect(idsOf({ query: 'marina@' })).toEqual(['marina@exemplo.com']);
  });

  it('"Convidados" holds both invitation statuses', () => {
    expect(idsOf({ status: 'invited' })).toEqual(['marina@exemplo.com', 'joao@exemplo.com']);
  });

  it('filters by status and by role', () => {
    expect(idsOf({ status: 'suspended' })).toEqual(['pedrinho']);
    expect(idsOf({ role: 'admin' })).toEqual(['joao@exemplo.com', 'lucas']);
  });
});

describe('statusCounts', () => {
  it('counts each tab over the search and the role, never over the tab itself', () => {
    expect(statusCounts(ROWS, { ...ALL, status: 'suspended' })).toEqual({
      all: 5,
      active: 2,
      invited: 2,
      suspended: 1,
    });
    expect(statusCounts(ROWS, { ...ALL, role: 'admin' })).toEqual({
      all: 2,
      active: 1,
      invited: 1,
      suspended: 0,
    });
  });
});

describe('lastAccessLabel', () => {
  it.each([
    [0, 'convite há 2 dias'],
    [1, 'venceu há 1 dia'],
    [2, 'há 3 h'],
    [3, 'nunca entrou'],
    [4, 'agora'],
  ])('row %i reads "%s"', (index, label) => {
    const row = ROWS[index];
    if (!row) throw new Error(`no row ${index}`);
    expect(lastAccessLabel(row, TEST_NOW)).toBe(label);
  });
});

describe('filtersOf', () => {
  it('reads q, status and role, and falls back to "all" for anything unknown', () => {
    expect(filtersOf(new URLSearchParams('q=bia&status=suspended&role=admin'))).toEqual({
      query: 'bia',
      status: 'suspended',
      role: 'admin',
    });
    expect(filtersOf(new URLSearchParams('status=deleted&role=owner'))).toEqual(ALL);
  });
});
