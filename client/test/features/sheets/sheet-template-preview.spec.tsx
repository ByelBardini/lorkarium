import type { SheetHostMessageDto, SheetManifestPermissionDto } from '@lorkarium/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SheetTemplatePreview } from '@/features/sheets/sheet-template-preview';
import { SAMPLE_SHEET_PREVIEW_DATA, type SheetPreviewData } from '@/lib/sheet-preview-data';
import { SheetChannelsFake, type HostPortFake } from '../../support/sheet-frame-fakes';

const SOURCE = { files: [{ path: 'index.html', content: '<p>Ficha</p>' }] };

let channels: SheetChannelsFake;

beforeEach(() => {
  channels = new SheetChannelsFake();
});

// The preview as the workbench holds it: the test data lives above it, across frames.
function PreviewWithData({
  permissions,
}: Readonly<{ permissions?: readonly SheetManifestPermissionDto[] }>) {
  const [testData, setTestData] = useState<SheetPreviewData>(SAMPLE_SHEET_PREVIEW_DATA);
  return (
    <SheetTemplatePreview
      source={SOURCE}
      createChannel={channels.create}
      permissions={permissions}
      testData={testData}
      onTestData={setTestData}
    />
  );
}

// Loads the frame mounted last and plays its `ready`: the host's end of its channel.
function connectFrame(): HostPortFake {
  const frame = screen.getByTitle('Prévia da ficha') as HTMLIFrameElement;
  vi.spyOn(frame.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  fireEvent.load(frame);
  const port = channels.created.at(-1)?.port1;
  if (!port) throw new Error('the preview opened no channel; expected one per frame');
  fromFrame(port, { type: 'ready', requestId: '1' });
  return port;
}

function fromFrame(port: HostPortFake, data: unknown): void {
  act(() => void port.dispatchEvent(new MessageEvent('message', { data })));
}

function statesOf(port: HostPortFake): Extract<SheetHostMessageDto, { type: 'state' }>[] {
  return (port.sent as SheetHostMessageDto[]).filter((message) => message.type === 'state');
}

async function openTestData(permissions?: readonly SheetManifestPermissionDto[]) {
  const user = userEvent.setup();
  render(<PreviewWithData permissions={permissions} />);
  const port = connectFrame();
  await user.click(screen.getByRole('button', { name: 'Dados de teste' }));
  return { user, port };
}

async function retype(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const field = screen.getByLabelText(label);
  await user.clear(field);
  if (text) await user.click(field).then(() => user.paste(text));
}

describe('the test data of the preview', () => {
  it('opens on the sample ("Exemplo", AC 10, PV 20/20) and closes again', async () => {
    const { user } = await openTestData();
    expect(screen.getByRole('button', { name: 'Dados de teste' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByLabelText('Nome do personagem')).toHaveValue('Exemplo');
    expect(screen.getByLabelText('CA')).toHaveValue(10);
    expect(
      JSON.parse((screen.getByLabelText('Barras (JSON)') as HTMLTextAreaElement).value),
    ).toEqual([expect.objectContaining({ label: 'PV', current: 20, max: 20 })]);
    await user.click(screen.getByRole('button', { name: 'Dados de teste' }));
    expect(screen.queryByLabelText('CA')).toBeNull();
  });

  it('editing the AC to 14 sends the frame a new state with it', async () => {
    const { user, port } = await openTestData();
    await retype(user, 'CA', '14');
    expect(statesOf(port).at(-1)?.character).toEqual({
      name: 'Exemplo',
      armorClass: 14,
      difficultyClass: 10,
    });
  });

  it("the frame's character.set shows in the panel", async () => {
    const { port } = await openTestData(['character:stats']);
    fromFrame(port, { type: 'character.set', requestId: '2', changes: { armorClass: 14 } });
    expect(screen.getByLabelText('CA')).toHaveValue(14);
  });

  it('new bars in JSON go to the frame with an id each', async () => {
    const { user, port } = await openTestData();
    await retype(user, 'Barras (JSON)', '[{"label":"MP","current":3,"max":6}]');
    expect(statesOf(port).at(-1)?.bars).toEqual([
      expect.objectContaining({ id: expect.any(String), label: 'MP', current: 3, max: 6 }),
    ]);
  });

  it('values that are not JSON show the error and the frame keeps the previous ones', async () => {
    const { user, port } = await openTestData();
    await retype(user, 'Valores (JSON)', '{"forca": 14}');
    const sent = statesOf(port).length;
    await retype(user, 'Valores (JSON)', '{forca: 16}');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Valores inválidos: o texto não é um JSON.',
    );
    expect(statesOf(port).slice(sent)).toEqual([]);
    expect(statesOf(port).at(-1)?.values).toEqual({ forca: 14 });
  });

  it('a blank name is refused with the field, keeping the name the frame has', async () => {
    const { user, port } = await openTestData();
    await retype(user, 'Nome do personagem', '');
    expect(screen.getByRole('alert')).toHaveTextContent(/^Personagem inválido: name: /);
    expect(statesOf(port).at(-1)?.token).toEqual({ name: 'Exemplo', image: null });
  });

  it('the edited data survives "Rodar de novo": the new frame starts from it', async () => {
    const { user } = await openTestData();
    await retype(user, 'CA', '14');
    await user.click(screen.getByRole('button', { name: 'Rodar de novo' }));
    const port = connectFrame();
    expect(statesOf(port)[0]?.character?.armorClass).toBe(14);
  });

  it('"Voltar ao exemplo" puts the sample back', async () => {
    const { user, port } = await openTestData();
    await retype(user, 'CA', '14');
    await user.click(screen.getByRole('button', { name: 'Voltar ao exemplo' }));
    expect(screen.getByLabelText('CA')).toHaveValue(10);
    expect(statesOf(port).at(-1)?.character?.armorClass).toBe(10);
  });
});

describe('the permissions of the preview', () => {
  it('a request the manifest declares is answered', () => {
    render(<PreviewWithData permissions={['character:stats']} />);
    const port = connectFrame();
    fromFrame(port, { type: 'character.set', requestId: '2', changes: { armorClass: 14 } });
    expect(port.sent).toContainEqual({ type: 'result', requestId: '2' });
  });

  it('a request the manifest does not declare is PERMISSION_NOT_DECLARED, changing nothing', () => {
    render(<PreviewWithData permissions={[]} />);
    const port = connectFrame();
    fromFrame(port, { type: 'character.set', requestId: '2', changes: { armorClass: 14 } });
    expect(port.sent).toContainEqual(
      expect.objectContaining({ type: 'error', requestId: '2', code: 'PERMISSION_NOT_DECLARED' }),
    );
    expect(statesOf(port)).toHaveLength(1);
  });
});
