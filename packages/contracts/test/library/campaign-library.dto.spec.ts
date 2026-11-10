import { describe, expect, it } from 'vitest';
import { campaignLibraryDto } from '../../src';

const library = {
  activeSceneId: null,
  folders: [],
  scenes: [],
  images: [],
  documents: [],
  maps: [],
  mainMapId: null,
};
const template = {
  id: '00000000-0000-4000-8000-000000000001',
  folderId: null,
  name: 'Ficha Tormenta',
  version: 0,
  updatedAt: '2026-10-31T00:00:00.000Z',
};
describe('campaign library aggregate', () => {
  it('accepts the player aggregate without sheet templates', () => {
    expect(campaignLibraryDto.safeParse(library).success).toBe(true);
  });
  it('accepts the master aggregate with template summaries and refuses template code', () => {
    expect(campaignLibraryDto.safeParse({ ...library, sheetTemplates: [template] }).success).toBe(
      true,
    );
    const withCode = { ...template, files: [{ path: 'index.html', content: '<p></p>' }] };
    expect(campaignLibraryDto.safeParse({ ...library, sheetTemplates: [withCode] }).success).toBe(
      false,
    );
  });
});

describe('campaign library sheets', () => {
  const sheet = {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Lyra',
    folderId: null,
    templateId: template.id,
    tokenId: null,
    memberId: null,
    visibility: 'controllers',
    version: 0,
  };
  it('accepts sheet summaries and refuses a sheet with its values', () => {
    expect(campaignLibraryDto.safeParse({ ...library, sheets: [sheet] }).success).toBe(true);
    const withValues = { ...sheet, values: { forca: 16 } };
    expect(campaignLibraryDto.safeParse({ ...library, sheets: [withValues] }).success).toBe(false);
  });
});
