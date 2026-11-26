import { act, fireEvent, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { planLimitMessage } from '@/lib/plan-limit-message';
import { LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';
import { openVharnChat, renderChatPanel } from '../../support/chat-panel-harness';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';

const MIB = 1024 * 1024;
const PLAN_LIMIT = { resource: 'storage', limit: 1, plan: 'free', reason: 'room' } as const;

function field(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Mensagem' });
}

function pngFile(size = 1024): File {
  return new File([new Uint8Array(size)], 'print.png', { type: 'image/png' });
}

function pasteFile(file: File): void {
  fireEvent.paste(field(), { clipboardData: { files: [file], getData: () => '' } });
}

async function attached(): Promise<void> {
  pasteFile(pngFile());
  await screen.findByRole('img', { name: 'Imagem anexada' });
}

describe('ChatComposer — a picture', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(async () => {
    deps = testDependencies();
    user = userEvent.setup();
    openVharnChat(deps);
    renderChatPanel(deps);
    await act(() => Promise.resolve());
  });

  it('pasting an image file sends it as a chat_image and shows the kept picture', async () => {
    const file = pngFile();
    pasteFile(file);

    const preview = await screen.findByRole('img', { name: 'Imagem anexada' });
    expect(preview).toHaveAttribute('src', `/api/assets/${LYRA_PORTRAIT.id}`);
    expect(deps.assets.sent).toEqual([
      { kind: 'upload', campaignId: VHARN.id, file, purpose: 'chat_image' },
    ]);
  });

  it('dropping an image file on the box does the same', async () => {
    const file = pngFile();
    fireEvent.drop(field(), { dataTransfer: { files: [file], types: ['Files'] } });

    await screen.findByRole('img', { name: 'Imagem anexada' });
    expect(deps.assets.sent.at(-1)).toMatchObject({ kind: 'upload', purpose: 'chat_image' });
  });

  it('the clip opens a picker of images only, and the chosen file goes the same way', async () => {
    const picker = screen.getByLabelText('Escolher imagem');
    expect(picker).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,image/gif');
    expect(screen.getByRole('button', { name: 'Anexar imagem' })).toHaveAttribute(
      'title',
      'Anexar imagem (Ctrl+I cola um link)',
    );

    await user.upload(picker, pngFile());

    await screen.findByRole('img', { name: 'Imagem anexada' });
  });

  it('Enter with the picture ready and no text sends only the picture, then clears it', async () => {
    await attached();

    await user.type(field(), '{Enter}');

    expect(deps.chat.sent.at(-1)?.request).toMatchObject({
      text: '',
      image: { assetId: LYRA_PORTRAIT.id },
    });
    expect(screen.queryByRole('img', { name: 'Imagem anexada' })).toBeNull();
  });

  it('the caption goes with the picture', async () => {
    await attached();

    await user.type(field(), 'olha a pista{Enter}');

    expect(deps.chat.sent.at(-1)?.request).toMatchObject({
      text: 'olha a pista',
      image: { assetId: LYRA_PORTRAIT.id },
    });
  });

  it('while the picture is on its way, Enter does not send', async () => {
    deps.assets.hold();
    pasteFile(pngFile());
    expect(await screen.findByText('Enviando imagem…')).toHaveAttribute('role', 'status');

    await user.type(field(), 'oi{Enter}');

    expect(deps.chat.sent).toEqual([]);
    deps.assets.release();
  });

  it('pasting text keeps pasting text, with no picture', async () => {
    await user.click(field());
    await user.paste('só texto');

    expect(field()).toHaveValue('só texto');
    expect(deps.assets.sent).toEqual([]);
  });

  it('"Remover imagem" takes the picture out and the message goes without it', async () => {
    await attached();

    await user.click(screen.getByRole('button', { name: 'Remover imagem' }));
    await user.type(field(), 'sem imagem{Enter}');

    expect(deps.chat.sent.at(-1)?.request.image).toBeNull();
  });

  it('a file of another type is refused with the reason, and nothing goes', async () => {
    pasteFile(new File(['oi'], 'nota.txt', { type: 'text/plain' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Só dá para anexar imagens: PNG, JPEG, WebP ou GIF.',
    );
    expect(deps.assets.sent).toEqual([]);
  });

  it('a file of 11 MiB is refused before going out', async () => {
    pasteFile(pngFile(11 * MIB));

    expect(await screen.findByRole('alert')).toHaveTextContent('A imagem passa de 10 MB.');
    expect(deps.assets.sent).toEqual([]);
  });

  it("the owner's storage full shows the plan's notice", async () => {
    deps.assets.answerWith({ ok: false, failure: { kind: 'plan_limit', planLimit: PLAN_LIMIT } });

    pasteFile(pngFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(planLimitMessage(PLAN_LIMIT));
  });

  it('a picture the server no longer has keeps the text and says so', async () => {
    await attached();
    deps.chat.answer = { ok: false, failure: { kind: 'image_expired' } };

    await user.type(field(), 'olha{Enter}');

    expect(
      await screen.findByText('Essa imagem não está mais disponível. Anexe de novo.'),
    ).toBeInTheDocument();
    expect(field()).toHaveValue('olha');
  });
});

describe('ChatComposer — Ctrl+I, a picture by link', () => {
  let deps: TestDependencies;
  let user: UserEvent;

  beforeEach(async () => {
    deps = testDependencies();
    user = userEvent.setup();
    openVharnChat(deps);
    renderChatPanel(deps);
    await act(() => Promise.resolve());
  });

  async function openLink(): Promise<HTMLElement> {
    await user.click(field());
    await user.keyboard('{Control>}i{/Control}');
    return screen.getByRole('textbox', { name: 'Link da imagem' });
  }

  it('Ctrl+I in the field opens the link field with the focus, writing nothing', async () => {
    const link = await openLink();

    expect(link).toHaveFocus();
    expect(field()).toHaveValue('');
  });

  it('Enter in the link imports it as a chat_image and shows the picture', async () => {
    const link = await openLink();

    await user.type(link, 'https://example.com/pista.png{Enter}');

    expect(deps.assets.sent).toEqual([
      {
        kind: 'link',
        campaignId: VHARN.id,
        url: 'https://example.com/pista.png',
        purpose: 'chat_image',
      },
    ]);
    await screen.findByRole('img', { name: 'Imagem anexada' });
  });

  it('Escape closes it without attaching and gives the focus back to the message', async () => {
    const link = await openLink();

    await user.type(link, 'https://example.com/a.png{Escape}');

    expect(screen.queryByRole('textbox', { name: 'Link da imagem' })).toBeNull();
    expect(field()).toHaveFocus();
    expect(deps.assets.sent).toEqual([]);
  });

  it('text that is not a link, and a link the server cannot reach, say why', async () => {
    await user.type(await openLink(), 'olha isso{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cole um link que comece com http:// ou https://.',
    );
    expect(deps.assets.sent).toEqual([]);

    deps.assets.answerWith({ ok: false, failure: { kind: 'link_unreachable' } });
    await user.type(await openLink(), 'https://example.com/sumiu.png{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para baixar esse link.');
  });
});
