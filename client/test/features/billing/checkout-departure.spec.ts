import { describe, expect, it } from 'vitest';
import {
  rememberPaidPlanBeforeCheckout,
  takePaidPlanBeforeCheckout,
} from '@/features/billing/checkout-departure';
import { StorageFake } from '../../support/storage-fake';

const UNTIL = '2026-12-23T15:00:00.000Z';

describe('the paid end held across the checkout', () => {
  it('gives back the end the account left with, once', () => {
    const storage = new StorageFake();
    rememberPaidPlanBeforeCheckout(storage, UNTIL);

    expect(takePaidPlanBeforeCheckout(storage)).toEqual({ known: true, paidPlanUntil: UNTIL });
    expect(takePaidPlanBeforeCheckout(storage)).toEqual({ known: false });
  });

  it('tells "no paid plan before" apart from "nothing held"', () => {
    const storage = new StorageFake();
    expect(takePaidPlanBeforeCheckout(storage)).toEqual({ known: false });

    rememberPaidPlanBeforeCheckout(storage, null);
    expect(takePaidPlanBeforeCheckout(storage)).toEqual({ known: true, paidPlanUntil: null });
  });

  it('a blocked storage neither throws nor holds anything', () => {
    const storage = new StorageFake(true);

    expect(() => rememberPaidPlanBeforeCheckout(storage, UNTIL)).not.toThrow();
    expect(takePaidPlanBeforeCheckout(storage)).toEqual({ known: false });
  });

  it.each([
    ['not JSON', '{'],
    ['another shape', '{"until":"x"}'],
    ['a number for the end', '{"paidPlanUntil":5}'],
  ])('a value held in %s reads as nothing held', (_name, raw) => {
    const storage = new StorageFake();
    storage.setItem('lorkarium.checkoutDeparture', raw);

    expect(takePaidPlanBeforeCheckout(storage)).toEqual({ known: false });
  });
});
