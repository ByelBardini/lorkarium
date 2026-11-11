import { describe, expect, it } from 'vitest';
import { IdleShelf } from '@/renderer/idle-shelf';

function shelfOf(limit: number) {
  const evicted: string[] = [];
  const shelf = new IdleShelf<number>(limit, (key) => evicted.push(key));
  return { shelf, evicted };
}

describe('IdleShelf', () => {
  it('keeps values up to the limit, evicting none', () => {
    const { shelf, evicted } = shelfOf(2);

    shelf.shelve('a', 1);
    shelf.shelve('b', 2);

    expect(evicted).toEqual([]);
    expect(shelf.size()).toBe(2);
  });

  it('one past the limit evicts the oldest', () => {
    const { shelf, evicted } = shelfOf(2);
    shelf.shelve('a', 1);
    shelf.shelve('b', 2);

    shelf.shelve('c', 3);

    expect(evicted).toEqual(['a']);
  });

  it('a value taken back leaves the shelf and is never evicted', () => {
    const { shelf, evicted } = shelfOf(1);
    shelf.shelve('a', 1);

    expect(shelf.takeBack('a')).toBe(1);
    shelf.shelve('b', 2);

    expect(evicted).toEqual([]);
    expect(shelf.takeBack('a')).toBeUndefined();
  });

  it('shelving a key again makes it the newest', () => {
    const { shelf, evicted } = shelfOf(2);
    shelf.shelve('a', 1);
    shelf.shelve('b', 2);
    shelf.shelve('a', 1);

    shelf.shelve('c', 3);

    expect(evicted).toEqual(['b']);
  });

  it('a limit of 0 evicts at once', () => {
    const { shelf, evicted } = shelfOf(0);

    shelf.shelve('a', 1);

    expect(evicted).toEqual(['a']);
  });

  it('clear evicts every value', () => {
    const { shelf, evicted } = shelfOf(3);
    shelf.shelve('a', 1);
    shelf.shelve('b', 2);

    shelf.clear();

    expect(evicted).toEqual(['a', 'b']);
    expect(shelf.size()).toBe(0);
  });

  it.each([-1, 1.5, Number.NaN])('a limit of %s is refused, naming it', (limit) => {
    expect(() => new IdleShelf(limit, () => undefined)).toThrow(
      `idle shelf limit: expected an integer ≥ 0, got ${String(limit)}`,
    );
  });
});
