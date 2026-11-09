import { describe, expect, it } from 'vitest';
import { CampaignAccessBo } from '../../../src/modules/campaigns/campaign-access.bo';
import { DocumentAccessBo } from '../../../src/modules/documents/document-access.bo';

function documentAccess(
  role: 'master' | 'player' | 'spectator' | null,
  ownerIds: string[] = [],
  document: Readonly<{ visibility: 'public' | 'private'; hiddenByFolder: boolean }> = {
    visibility: 'private',
    hiddenByFolder: false,
  },
): DocumentAccessBo {
  return new DocumentAccessBo(
    new CampaignAccessBo({ campaignId: 'campaign-a', userId: 'reader', role }),
    { id: 'document-a', ...document, ownerIds, version: 3 },
  );
}
describe('DocumentAccessBo', () => {
  describe('a public document inside a private folder', () => {
    const hidden = { visibility: 'public', hiddenByFolder: true } as const;
    it('is not read by a player who does not own it', () => {
      expect(documentAccess('player', [], hidden).canRead()).toBe(false);
    });
    it('is read by the player who owns it', () => {
      expect(documentAccess('player', ['reader'], hidden).canRead()).toBe(true);
    });
    it('is read by the master', () => {
      expect(documentAccess('master', [], hidden).canRead()).toBe(true);
    });
  });
  it('master reads and manages a private document without ownership', () => {
    const access = documentAccess('master');
    expect([access.canRead(), access.canEdit(), access.canManage()]).toEqual([true, true, true]);
  });
  it('player owner reads and edits private content without administration', () => {
    const access = documentAccess('player', ['reader']);
    expect([access.canRead(), access.canEdit(), access.canManage()]).toEqual([true, true, false]);
    expect(() => access.requireManage()).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  });
  it('spectator ownership does not grant private reading or editing', () => {
    const access = documentAccess('spectator', ['reader']);
    expect(access.canRead()).toBe(false);
    expect(() => access.requireEdit()).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_NOT_FOUND' }),
    );
  });
  it('private document hides its existence from another player', () => {
    expect(() => documentAccess('player').requireRead()).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_NOT_FOUND' }),
    );
  });
  it('version mismatch refuses the write with conflict', () => {
    expect(() => documentAccess('master').requireVersion(2)).toThrow(
      expect.objectContaining({ code: 'DOCUMENT_VERSION_CONFLICT' }),
    );
    expect(() => documentAccess('master').requireVersion(3)).not.toThrow();
  });
});
