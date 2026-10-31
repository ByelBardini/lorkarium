import { describe, expect, it } from 'vitest';
import {
  createDocumentRequestDto,
  updateDocumentRequestDto,
  updateDocumentContentRequestDto,
} from '../../src';

const id = '00000000-0000-4000-8000-000000000001';
const action = { actionId: id, expectedVersion: 0 };
describe('document commands', () => {
  it('trims document names while leaving omitted creation defaults to the server', () => {
    expect(createDocumentRequestDto.parse({ actionId: id, name: '  Carta  ' })).toEqual({
      actionId: id,
      name: 'Carta',
    });
    expect(createDocumentRequestDto.parse({ actionId: id })).toEqual({ actionId: id });
  });
  it('refuses repeated owners and accepts clearing all owners', () => {
    expect(updateDocumentRequestDto.safeParse({ ...action, ownerIds: [id, id] }).success).toBe(
      false,
    );
    expect(updateDocumentRequestDto.parse({ ...action, ownerIds: [] })).toEqual({
      ...action,
      ownerIds: [],
    });
  });
  it('refuses both kinds of empty patch and administrative fields in a content patch', () => {
    expect(updateDocumentRequestDto.safeParse(action).success).toBe(false);
    expect(updateDocumentContentRequestDto.safeParse(action).success).toBe(false);
    expect(
      updateDocumentContentRequestDto.safeParse({ ...action, name: 'Carta', visibility: 'public' })
        .success,
    ).toBe(false);
  });
  it('refuses a document body in the rename command now that the body lives in the tabs', () => {
    const content = { type: 'doc', content: [] };
    expect(
      updateDocumentContentRequestDto.safeParse({ ...action, name: 'Carta', content }).success,
    ).toBe(false);
  });
  it.each(['', ' ', 'x'.repeat(61)])('refuses invalid document title %j', (name) =>
    expect(createDocumentRequestDto.safeParse({ actionId: id, name }).success).toBe(false),
  );
  it('allows moving a document to the root and rejects negative expected versions', () => {
    expect(updateDocumentRequestDto.parse({ ...action, folderId: null })).toEqual({
      ...action,
      folderId: null,
    });
    expect(
      updateDocumentContentRequestDto.safeParse({ ...action, expectedVersion: -1, name: 'Carta' })
        .success,
    ).toBe(false);
  });
});
