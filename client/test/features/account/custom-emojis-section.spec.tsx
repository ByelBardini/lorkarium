import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CustomEmojisContext } from '@/components/custom-emojis/use-custom-emojis-store';
import { CustomEmojisSection } from '@/features/account/custom-emojis-section';
import { createCustomEmojisStore } from '@/stores/custom-emojis-store';
import { CustomEmojisApiFake } from '../../support/custom-emojis-api-fake';

async function renderSection(api: CustomEmojisApiFake) {
  const store = createCustomEmojisStore(api);
  await store.getState().load();
  render(
    <CustomEmojisContext value={store}>
      <CustomEmojisSection />
    </CustomEmojisContext>,
  );
  return store;
}

function picture(): File {
  return new File(['png'], 'festa.png', { type: 'image/png' });
}

async function fillForm(name: string): Promise<void> {
  const form = screen.getByRole('form', { name: 'Novo emoji' });
  await userEvent.type(within(form).getByLabelText('Nome'), name);
  await userEvent.upload(within(form).getByLabelText('Escolher imagem'), picture());
}

describe('CustomEmojisSection', () => {
  it('shows the count against the plan and each emoji by its :name:', async () => {
    await renderSection(new CustomEmojisApiFake().with('festa', 'bolo'));

    expect(screen.getByText('2 de 10')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Seus emojis' });
    expect(within(list).getByText(':festa:')).toBeInTheDocument();
  });

  it('adds one: the name and the picture go up, and the form clears', async () => {
    const api = new CustomEmojisApiFake();
    await renderSection(api);

    await fillForm('Festa Boa');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar emoji' }));

    expect(api.calls).toContain('create festa_boa');
    expect(await screen.findByText(':festa_boa:')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('');
  });

  it('a name of the catalog is told before anything is sent', async () => {
    const api = new CustomEmojisApiFake();
    await renderSection(api);

    await fillForm('doge');

    expect(screen.getByRole('alert')).toHaveTextContent('Esse nome já é de um emoji do catálogo.');
    expect(screen.getByRole('button', { name: 'Adicionar emoji' })).toBeDisabled();
    expect(api.calls).toEqual(['list']);
  });

  it('a name the account has is the server’s refusal, shown', async () => {
    const api = new CustomEmojisApiFake().with('festa');
    await renderSection(api);

    await fillForm('festa');
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar emoji' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Você já tem um emoji com esse nome.',
    );
  });

  it('past the ceiling the newest read "Inativo" and the form gives way to the reason', async () => {
    const api = new CustomEmojisApiFake().with('um', 'dois', 'tres');
    api.limit = 2;
    await renderSection(api);

    const tres = within(screen.getByRole('list', { name: 'Seus emojis' })).getAllByRole(
      'listitem',
    )[2]!;
    expect(tres).toHaveTextContent(':tres:Inativo');
    expect(screen.getByText(/passam do que o seu plano permite \(2\)/u)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Novo emoji' })).toBeNull();
    expect(screen.getByText(/Apague um para adicionar outro/u)).toBeInTheDocument();
  });

  it('Grátis sees which plan opens it, and no form', async () => {
    const api = new CustomEmojisApiFake();
    api.limit = 0;
    await renderSection(api);

    expect(screen.getByText(/a partir do plano Apoiador/u)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Novo emoji' })).toBeNull();
  });

  it('removing asks first, "Manter" keeps it and "Apagar" removes it', async () => {
    const api = new CustomEmojisApiFake().with('festa');
    await renderSection(api);

    await userEvent.click(screen.getByRole('button', { name: 'Apagar :festa:' }));
    await userEvent.click(screen.getByRole('button', { name: 'Manter' }));
    expect(api.calls).toEqual(['list']);

    await userEvent.click(screen.getByRole('button', { name: 'Apagar :festa:' }));
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(await screen.findByText('Nenhum emoji ainda.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Seus emojis' })).toBeNull();
  });

  it('renames in place', async () => {
    const api = new CustomEmojisApiFake().with('festa');
    await renderSection(api);

    await userEvent.click(screen.getByRole('button', { name: 'Renomear :festa:' }));
    const field = screen.getByRole('textbox', { name: 'Novo nome de :festa:' });
    await userEvent.clear(field);
    await userEvent.type(field, 'bolo');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(':bolo:')).toBeInTheDocument();
  });
});
