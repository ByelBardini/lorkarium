import { describe, expect, it } from 'vitest';
import { insertedTabOrder, movedTabOrder, shiftedTabOrder, tabMoveStepOf } from '@/lib/tab-order';

describe('tab order after a drop', () => {
  it('a tab dropped on the first takes its place and the others shift right', () => {
    expect(movedTabOrder(['geral', 'itens', 'segredos'], 'segredos', 'geral')).toEqual([
      'segredos',
      'geral',
      'itens',
    ]);
  });
  it('a tab dropped on the last ends the list', () => {
    expect(movedTabOrder(['geral', 'itens', 'segredos'], 'geral', 'segredos')).toEqual([
      'itens',
      'segredos',
      'geral',
    ]);
  });
  it('a drop on itself or on an unknown tab keeps the order', () => {
    const order = ['geral', 'itens'];
    expect(movedTabOrder(order, 'itens', 'itens')).toBe(order);
    expect(movedTabOrder(order, 'itens', 'sumiu')).toBe(order);
  });
});
describe('tab order moved by one place', () => {
  it('right swaps with the next tab', () => {
    expect(shiftedTabOrder(['geral', 'itens', 'segredos'], 'geral', 1)).toEqual([
      'itens',
      'geral',
      'segredos',
    ]);
  });
  it('left swaps with the previous tab', () => {
    expect(shiftedTabOrder(['geral', 'itens', 'segredos'], 'segredos', -1)).toEqual([
      'geral',
      'segredos',
      'itens',
    ]);
  });
  it('past either end keeps the order', () => {
    const order = ['geral', 'itens'];
    expect(shiftedTabOrder(order, 'geral', -1)).toBe(order);
    expect(shiftedTabOrder(order, 'itens', 1)).toBe(order);
  });
});

describe('the keys that move a tab', () => {
  const press = (
    key: string,
    mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>>,
  ) => ({
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...mods,
  });

  it('Ctrl+Shift+ArrowLeft moves left and Ctrl+Shift+ArrowRight right; ⌘+Shift too', () => {
    expect(tabMoveStepOf(press('ArrowLeft', { ctrlKey: true, shiftKey: true }))).toBe(-1);
    expect(tabMoveStepOf(press('ArrowRight', { ctrlKey: true, shiftKey: true }))).toBe(1);
    expect(tabMoveStepOf(press('ArrowRight', { metaKey: true, shiftKey: true }))).toBe(1);
  });

  it('a bare arrow, one without Shift, with Alt, or another key moves nothing', () => {
    expect(tabMoveStepOf(press('ArrowLeft', {}))).toBeNull();
    expect(tabMoveStepOf(press('ArrowLeft', { ctrlKey: true }))).toBeNull();
    expect(
      tabMoveStepOf(press('ArrowLeft', { ctrlKey: true, shiftKey: true, altKey: true })),
    ).toBeNull();
    expect(tabMoveStepOf(press('ArrowUp', { ctrlKey: true, shiftKey: true }))).toBeNull();
  });
});

describe('tab order after a drop between two tabs', () => {
  it('goes before the tab named, wherever it came from', () => {
    expect(insertedTabOrder(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(insertedTabOrder(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'a', 'c']);
  });

  it('with no tab named, it goes to the end', () => {
    expect(insertedTabOrder(['a', 'b', 'c'], 'a', null)).toEqual(['b', 'c', 'a']);
  });

  it('a drop that leaves it where it was, or unknown ids, hand back the same array', () => {
    const order = ['a', 'b', 'c'];
    expect(insertedTabOrder(order, 'a', 'b')).toBe(order);
    expect(insertedTabOrder(order, 'c', null)).toBe(order);
    expect(insertedTabOrder(order, 'x', 'a')).toBe(order);
    expect(insertedTabOrder(order, 'a', 'x')).toBe(order);
  });
});
