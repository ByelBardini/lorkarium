import { describe, expect, it } from 'vitest';
import { movedTabOrder, shiftedTabOrder } from '@/lib/tab-order';

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
