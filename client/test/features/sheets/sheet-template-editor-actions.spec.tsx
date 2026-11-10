import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { SheetTemplateEditor } from '@/features/sheets/sheet-template-editor';
import { InlineHandlerNotice } from '@/features/sheets/sheet-template-editor-actions';
import { createSheetTemplateDraftStore } from '@/stores/sheet-template-draft-store';
import { VHARN } from '../../support/campaigns-api-fake';
import { replaceCode } from '../../support/code-editor-input';
import { TORMENTA_TEMPLATE_ID } from '../../support/sheet-fixtures';
import { SheetChannelsFake } from '../../support/sheet-frame-fakes';
import { SheetTemplatesApiFake } from '../../support/sheet-templates-api-fake';

const NOTICE = 'Atributos que não vão rodar';
const WITH_ONCLICK = '<main>\n  <h1>Lyra</h1>\n  <button onclick="curar()">+1 PV</button>\n</main>';

let api: SheetTemplatesApiFake;

beforeEach(() => {
  api = new SheetTemplatesApiFake();
});

async function openTormenta() {
  const user = userEvent.setup();
  const draft = createSheetTemplateDraftStore({
    api,
    campaignId: VHARN.id,
    templateId: TORMENTA_TEMPLATE_ID,
  });
  render(<SheetTemplateEditor draft={draft} live createChannel={new SheetChannelsFake().create} />);
  await screen.findByRole('textbox', { name: 'Arquivo index.html' });
  return user;
}

describe('the editor warns about attributes that will not run', () => {
  it('saving html with an onclick on line 3 warns with the line and saves anyway', async () => {
    const user = await openTormenta();
    replaceCode('Arquivo index.html', WITH_ONCLICK);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    const notice = await screen.findByRole('note', { name: NOTICE });
    expect(notice).toHaveTextContent('1 atributo de evento não vai rodar · index.html, linha 3');
    expect(notice).toHaveTextContent('addEventListener');
    expect(api.updates.map((update) => update.input.files?.[0]?.content)).toEqual([WITH_ONCLICK]);
  });

  it('saving html with no event attribute shows no warning', async () => {
    const user = await openTormenta();
    replaceCode('Arquivo index.html', '<button id="curar" type="button">+1 PV</button>');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.updates).toHaveLength(1));
    expect(await screen.findByText('Salvo.')).toBeInTheDocument();
    expect(screen.queryByRole('note', { name: NOTICE })).toBeNull();
  });

  it('typing an onclick without saving shows no warning yet', async () => {
    await openTormenta();
    replaceCode('Arquivo index.html', WITH_ONCLICK);
    expect(screen.queryByRole('note', { name: NOTICE })).toBeNull();
  });
});

describe('InlineHandlerNotice', () => {
  it('lists the lines of every attribute of every saved html file, never of the js', () => {
    const files = [
      { path: 'index.html', content: '<a href="javascript:x()">a</a>\n<b onclick="y()">' },
      { path: 'a.js', content: 'el.innerHTML = "<b onclick=z()>";' },
      { path: 'paginas/perfil.html', content: '<p>\n<img onerror="w()">' },
    ];
    render(<InlineHandlerNotice savedFiles={files} />);
    expect(screen.getByRole('note', { name: NOTICE })).toHaveTextContent(
      '3 atributos de evento não vão rodar · index.html, linhas 1 e 2; paginas/perfil.html, linha 2',
    );
  });

  it('draws nothing with nothing saved', () => {
    const { container } = render(<InlineHandlerNotice savedFiles={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
