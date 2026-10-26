import { describe, expect, it } from 'vitest';
import {
  DICE_3D_STORAGE_KEY,
  DICE_SOUND_STORAGE_KEY,
  createDicePreferencesStore,
} from '@/stores/dice-preferences-store';
import { StorageFake } from '../support/storage-fake';

describe('createDicePreferencesStore', () => {
  it('with nothing stored the 3D dice are on', () => {
    expect(createDicePreferencesStore(new StorageFake()).getState().threeD).toBe(true);
  });

  it('turning the 3D dice off is remembered under lorkarium.dice3d', () => {
    const storage = new StorageFake();
    createDicePreferencesStore(storage).getState().setThreeD(false);

    expect(DICE_3D_STORAGE_KEY).toBe('lorkarium.dice3d');
    expect(storage.values.get('lorkarium.dice3d')).toBe('off');
    expect(createDicePreferencesStore(storage).getState().threeD).toBe(false);
  });

  it('turning them on again is remembered on', () => {
    const storage = new StorageFake();
    storage.values.set('lorkarium.dice3d', 'off');
    const store = createDicePreferencesStore(storage);

    store.getState().setThreeD(true);

    expect(store.getState().threeD).toBe(true);
    expect(storage.values.get('lorkarium.dice3d')).toBe('on');
  });

  it('an unknown stored value leaves them on', () => {
    const storage = new StorageFake();
    storage.values.set('lorkarium.dice3d', 'maybe');
    expect(createDicePreferencesStore(storage).getState().threeD).toBe(true);
  });

  it('a storage that throws starts on, and turning off still works in memory', () => {
    const store = createDicePreferencesStore(new StorageFake(true));
    expect(store.getState().threeD).toBe(true);

    store.getState().setThreeD(false);

    expect(store.getState().threeD).toBe(false);
  });

  it('with nothing stored the sound is on', () => {
    expect(createDicePreferencesStore(new StorageFake()).getState().sound).toBe(true);
  });

  it('muting is remembered under lorkarium.diceSound and leaves the 3D alone', () => {
    const storage = new StorageFake();
    createDicePreferencesStore(storage).getState().setSound(false);

    expect(DICE_SOUND_STORAGE_KEY).toBe('lorkarium.diceSound');
    expect(storage.values.get('lorkarium.diceSound')).toBe('off');
    const reopened = createDicePreferencesStore(storage).getState();
    expect(reopened.sound).toBe(false);
    expect(reopened.threeD).toBe(true);
  });

  it('an unknown stored sound value leaves it on', () => {
    const storage = new StorageFake();
    storage.values.set('lorkarium.diceSound', 'loud');
    expect(createDicePreferencesStore(storage).getState().sound).toBe(true);
  });
});
