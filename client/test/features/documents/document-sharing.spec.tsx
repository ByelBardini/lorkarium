import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DocumentSharing } from '@/features/documents/document-sharing';
import type { LibraryIntent } from '@/features/library/library-intents';
import { detailOf, VHARN } from '../../support/campaigns-api-fake';
import { documentFixture } from '../../support/documents-fixtures';

class LibrarySubmitRecorder {
  intents: LibraryIntent[] = [];
  send = async (intent: LibraryIntent): Promise<void> => {
    this.intents.push(intent);
  };
}
function renderSharing(
  changes: Parameters<typeof documentFixture>[0] = {},
  disabled = false,
): LibrarySubmitRecorder {
  const recorder = new LibrarySubmitRecorder();
  render(
    <DocumentSharing
      document={documentFixture(changes)}
      campaign={detailOf(VHARN)}
      submit={recorder.send}
      disabled={disabled}
    />,
  );
  return recorder;
}
describe('document master sharing controls', () => {
  it('keeps administrative controls behind the sharing button until requested', async () => {
    renderSharing();
    expect(
      screen.queryByRole('checkbox', { name: 'Visível para todos na mesa' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhamento' }));
    expect(
      screen.getByRole('checkbox', { name: 'Visível para todos na mesa' }),
    ).toBeInTheDocument();
  });
  it('submits both selected player owners with the document version and excludes the master', async () => {
    const recorder = renderSharing({ version: 4 });
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhamento' }));
    expect(screen.queryByRole('checkbox', { name: 'Ana' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Caio' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Duda' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar donos' }));
    expect(recorder.intents).toEqual([
      {
        intent: 'updateDocument',
        documentId: '10000000-0000-4000-8000-000000000001',
        changes: {
          actionId: expect.any(String),
          expectedVersion: 4,
          ownerIds: [
            'b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f',
            '1e2d3c4b-5a69-4788-9abc-def012345678',
          ],
        },
      },
    ]);
  });
  it('submits an empty owner list after removing the last owner', async () => {
    const recorder = renderSharing({ ownerIds: ['b4d6e8f0-1a2b-4c3d-8e5f-6a7b8c9d0e1f'] });
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhamento' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Caio' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar donos' }));
    expect(recorder.intents[0]).toMatchObject({ changes: { ownerIds: [] } });
  });
  it('publishes through an administrative command without altering content', async () => {
    const recorder = renderSharing({ version: 3 });
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhamento' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Visível para todos na mesa' }));
    expect(recorder.intents).toEqual([
      {
        intent: 'updateDocument',
        documentId: '10000000-0000-4000-8000-000000000001',
        changes: { actionId: expect.any(String), expectedVersion: 3, visibility: 'public' },
      },
    ]);
  });
  it('hides administration for a player owner and blocks controls during a pending save', async () => {
    const recorder = renderSharing({ canManage: false, canEdit: true });
    expect(screen.queryByRole('button', { name: 'Salvar donos' })).not.toBeInTheDocument();
    expect(recorder.intents).toEqual([]);
  });
  it('disables owner and visibility submission while a draft is pending', async () => {
    const recorder = renderSharing({}, true);
    await userEvent.click(screen.getByRole('button', { name: 'Compartilhamento' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar donos' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Visível para todos na mesa' }));
    expect(screen.getByRole('button', { name: 'Salvar donos' })).toBeDisabled();
    expect(recorder.intents).toEqual([]);
  });
});
