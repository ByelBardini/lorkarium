import { describe, expect, it } from 'vitest';
import { dayLabelOf, directFeedOf } from '@/lib/direct-feed';
import { BIA, ME_ID, dmSent } from '../support/friends-fixtures';

const NOW = new Date(2026, 10, 12, 20, 0);

function at(day: number, hour: number, minute: number): string {
  return new Date(2026, 10, day, hour, minute).toISOString();
}

describe('directFeedOf', () => {
  it('runs of one author stay together; the other author starts a new run', () => {
    const feed = directFeedOf(
      [
        dmSent({ at: at(12, 10, 0), text: 'oi' }),
        dmSent({ at: at(12, 10, 1), text: 'tudo bem?' }),
        dmSent({ at: at(12, 10, 2), fromUserId: ME_ID, toUserId: BIA.userId, text: 'sim' }),
      ],
      ME_ID,
      NOW,
    );
    expect(feed).toHaveLength(1);
    expect(feed[0]?.runs.map((run) => [run.mine, run.messages.map((m) => m.text)])).toEqual([
      [false, ['oi', 'tudo bem?']],
      [true, ['sim']],
    ]);
  });

  it('more than 5 minutes apart starts a new run of the same author', () => {
    const feed = directFeedOf(
      [dmSent({ at: at(12, 10, 0) }), dmSent({ at: at(12, 10, 6) })],
      ME_ID,
      NOW,
    );
    expect(feed[0]?.runs).toHaveLength(2);
  });

  it('each local day has its own separator', () => {
    const feed = directFeedOf(
      [dmSent({ at: at(3, 10, 0) }), dmSent({ at: at(11, 10, 0) }), dmSent({ at: at(12, 9, 0) })],
      ME_ID,
      NOW,
    );
    expect(feed.map((day) => day.label)).toEqual(['3 de novembro', 'Ontem', 'Hoje']);
  });
});

describe('dayLabelOf', () => {
  it('today is "Hoje", yesterday "Ontem", any other day its date', () => {
    expect(dayLabelOf(new Date(2026, 10, 12, 0, 1), NOW)).toBe('Hoje');
    expect(dayLabelOf(new Date(2026, 10, 11, 23, 59), NOW)).toBe('Ontem');
    expect(dayLabelOf(new Date(2026, 10, 10, 12, 0), NOW)).toBe('10 de novembro');
  });
});
