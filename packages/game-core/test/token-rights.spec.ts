import { describe, expect, it } from 'vitest';
import {
  canCreateTokens,
  tokenRightsOf,
  type TableTokenRights,
  type TokenRightsViewer,
} from '../src/token-rights';

const BIA_ID = '9c2f4e61-7a3b-4d5c-8e9f-0b1a2c3d4e5f';
const CAIO_ID = 'b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f';
const LYRA_CHARACTER_ID = '1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b';

const bia: TokenRightsViewer = { role: 'player', userId: BIA_ID };
const master: TokenRightsViewer = { role: 'master', userId: CAIO_ID };
const spectator: TokenRightsViewer = { role: 'spectator', userId: BIA_ID };
const allOn: TableTokenRights = { create: true, delete: true };
const allOff: TableTokenRights = { create: false, delete: false };
const biaToken = { createdBy: BIA_ID, characterId: null, controllerIds: [BIA_ID] };

describe('canCreateTokens', () => {
  it('a player creates when the table lets players create', () => {
    expect(canCreateTokens(bia, { create: true, delete: false })).toBe(true);
  });

  it('a player does not create with only the delete setting on', () => {
    expect(canCreateTokens(bia, { create: false, delete: true })).toBe(false);
  });

  it('the master creates with every setting off', () => {
    expect(canCreateTokens(master, allOff)).toBe(true);
  });

  it('a spectator never creates, even with every setting on', () => {
    expect(canCreateTokens(spectator, allOn)).toBe(false);
  });
});

describe('tokenRightsOf', () => {
  it('the creator edits and deletes their own token with both settings on', () => {
    expect(tokenRightsOf(bia, allOn, biaToken)).toEqual({ edit: true, delete: true });
  });

  it('the master edits and deletes a linked token of someone else with every setting off', () => {
    const linked = { createdBy: BIA_ID, characterId: LYRA_CHARACTER_ID, controllerIds: [] };
    expect(tokenRightsOf(master, allOff, linked)).toEqual({ edit: true, delete: true });
  });

  it('only the create setting gives edit without delete', () => {
    const rights = tokenRightsOf(bia, { create: true, delete: false }, biaToken);
    expect(rights).toEqual({ edit: true, delete: false });
  });

  it('only the delete setting gives delete without edit', () => {
    const rights = tokenRightsOf(bia, { create: false, delete: true }, biaToken);
    expect(rights).toEqual({ edit: false, delete: true });
  });

  it('a token of hers linked to a character she does not control stays closed', () => {
    const linked = { createdBy: BIA_ID, characterId: LYRA_CHARACTER_ID, controllerIds: [] };
    expect(tokenRightsOf(bia, allOn, linked)).toEqual({ edit: false, delete: false });
  });

  it.each([
    ['created by Caio', CAIO_ID],
    ['with no known creator', null],
  ])('a token %s gives her nothing', (_label, createdBy) => {
    const token = { createdBy, characterId: null, controllerIds: [BIA_ID] };
    expect(tokenRightsOf(bia, allOn, token)).toEqual({ edit: false, delete: false });
  });

  it('a spectator gets nothing, even on a token they created', () => {
    expect(tokenRightsOf(spectator, allOn, biaToken)).toEqual({ edit: false, delete: false });
  });
});

describe('tokenRightsOf on the token of her character', () => {
  const lyra = { createdBy: null, characterId: LYRA_CHARACTER_ID, controllerIds: [BIA_ID] };

  it('the player who controls it edits with every setting off, and never deletes', () => {
    expect(tokenRightsOf(bia, allOff, lyra)).toEqual({ edit: true, delete: false });
    expect(tokenRightsOf(bia, allOn, lyra)).toEqual({ edit: true, delete: false });
  });

  it('a spectator kept in the control stays out', () => {
    expect(tokenRightsOf(spectator, allOn, lyra)).toEqual({ edit: false, delete: false });
  });
});
