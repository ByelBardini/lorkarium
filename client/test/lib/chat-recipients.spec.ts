import { describe, expect, it } from 'vitest';
import { chatContactsOf, recipientsCheckOf } from '@/lib/chat-recipients';
import { ANA } from '../support/auth-api-fake';
import { TRIO_GROUP_ID } from '../support/chat-fixtures';
import { ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE, duda } from '../support/table-session-fixtures';

// The VHARN roster: Ana and Caio online, Bia offline.
const ROSTER = [ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE];
const BIA = BIA_AT_TABLE.userId;
const CAIO = CAIO_AT_TABLE.userId;
const TABLE = { kind: 'table' } as const;

function group(memberIds: string[]) {
  return { kind: 'group', groupId: TRIO_GROUP_ID, name: 'Os Três', memberIds } as const;
}

describe('recipientsCheckOf', () => {
  it('the Table without a whisper is never blocked nor warned', () => {
    expect(recipientsCheckOf(TABLE, null, ROSTER, ANA.id)).toEqual({
      blocked: false,
      offlineIds: [],
    });
  });

  it('a whisper to Bia, offline, is blocked naming her', () => {
    expect(recipientsCheckOf(TABLE, BIA, ROSTER, ANA.id)).toEqual({
      blocked: true,
      offlineIds: [BIA],
    });
  });

  it('a whisper to Caio, online, goes', () => {
    expect(recipientsCheckOf(TABLE, CAIO, ROSTER, ANA.id)).toEqual({
      blocked: false,
      offlineIds: [],
    });
  });

  it('a direct with Bia, offline, is blocked', () => {
    const direct = { kind: 'direct', userId: BIA } as const;

    expect(recipientsCheckOf(direct, null, ROSTER, ANA.id)).toEqual({
      blocked: true,
      offlineIds: [BIA],
    });
  });

  it('a group with part offline goes, listing who will not receive it', () => {
    expect(recipientsCheckOf(group([ANA.id, BIA, CAIO]), null, ROSTER, ANA.id)).toEqual({
      blocked: false,
      offlineIds: [BIA],
    });
  });

  it('a group with every other member offline is blocked (the sender does not count)', () => {
    const offlineCaio = { ...CAIO_AT_TABLE, online: false };

    expect(
      recipientsCheckOf(
        group([ANA.id, BIA, CAIO]),
        null,
        [ANA_AT_TABLE, BIA_AT_TABLE, offlineCaio],
        ANA.id,
      ),
    ).toEqual({ blocked: true, offlineIds: [BIA, CAIO] });
  });

  it('someone no longer in the roster (a spectator who left) counts as offline', () => {
    const gone = duda().userId;

    expect(recipientsCheckOf(group([ANA.id, CAIO, gone]), null, ROSTER, ANA.id)).toEqual({
      blocked: false,
      offlineIds: [gone],
    });
  });
});

describe('chatContactsOf', () => {
  it('lists everyone but the viewer, online first, then by name', () => {
    const contacts = chatContactsOf([ANA_AT_TABLE, BIA_AT_TABLE, CAIO_AT_TABLE, duda()], ANA.id);

    expect(contacts.map((member) => member.name)).toEqual(['Caio', 'Duda', 'Bia']);
  });
});
