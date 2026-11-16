import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLoaderData } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { badgesRoute, type BadgesLoaderData } from '@/features/admin/admin-routes';
import { BadgesPage } from '@/features/admin/badges-page';
import type { ImageCropRect } from '@/services/assets-api';
import { testDependencies, type TestDependencies } from '../../support/app-dependencies';
import { ROOT_ADMIN } from '../../support/auth-api-fake';
import { FOUNDER_BADGE, VETERAN_BADGE } from '../../support/badges-admin-api-fake';
import { fakeCropAreaReporting } from '../../support/crop-area-fake';

const SQUARE: ImageCropRect = { x: 10, y: 0, width: 60, height: 100 };
const CropArea = fakeCropAreaReporting(SQUARE);

function pngOf(bytes: number): File {
  return new File([new Uint8Array(bytes)], 'insignia.png', { type: 'image/png' });
}

describe('badge images (sheet and row)', () => {
  let deps: TestDependencies;

  beforeEach(async () => {
    deps = testDependencies();
    deps.sessionStore.getState().signedIn(ROOT_ADMIN);
  });

  // The catalog route with the crop area a spec can drive (jsdom never measures the real one).
  async function open(): Promise<void> {
    const route = badgesRoute(deps);
    const router = createMemoryRouter(
      [
        {
          path: '/admin/badges',
          ...route,
          Component: function BadgesWithFakeCrop(): React.JSX.Element {
            const { badges } = useLoaderData<BadgesLoaderData>();
            return <BadgesPage badges={badges} api={deps.badgesAdminApi} cropArea={CropArea} />;
          },
        },
      ],
      { initialEntries: ['/admin/badges'] },
    );
    render(<RouterProvider router={router} />);
    await screen.findByRole('heading', { name: 'Insígnias' });
  }

  async function frame(scope: HTMLElement, file: File): Promise<void> {
    await userEvent.upload(within(scope).getByLabelText('Arquivo de imagem'), file);
    const crop = await screen.findByRole('dialog', { name: 'Recortar a insígnia' });
    expect(within(crop).getByLabelText('Área de recorte')).toHaveAttribute('data-aspect', '1');
    await userEvent.click(within(crop).getByRole('button', { name: 'Recorte de teste' }));
    await userEvent.click(within(crop).getByRole('button', { name: 'Enviar' }));
  }

  async function startNew(): Promise<HTMLElement> {
    await userEvent.click(screen.getByRole('button', { name: 'Nova insígnia' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nova insígnia' });
    await userEvent.type(within(sheet).getByLabelText('Nome'), 'Raro');
    await userEvent.type(within(sheet).getByLabelText('Descrição'), 'Achou o dado de ouro');
    return sheet;
  }

  function rowOf(name: string): HTMLElement {
    const row = screen.getByText(name, { selector: 'td' }).closest('tr');
    if (!row) throw new Error(`no catalog row for "${name}"`);
    return row;
  }

  it('the image is framed in 1:1, previewed, and sent with the rectangle after the texts', async () => {
    await open();
    const sheet = await startNew();
    await frame(sheet, pngOf(1024));
    expect(await within(sheet).findByRole('img', { name: 'Prévia da insígnia' })).toBeVisible();
    expect(within(sheet).getByRole('button', { name: 'Trocar imagem' })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Criar' }));
    expect(await screen.findByText('“Raro” criada.')).toHaveAttribute('role', 'status');
    const created = deps.badgesAdminApi.badges[0];
    expect(deps.badgesAdminApi.uploads).toEqual([
      { badgeId: created?.id, file: expect.any(File), crop: SQUARE },
    ]);
    expect(deps.badgesAdminApi.answers.calls.map(({ method }) => method)).toEqual([
      'catalog',
      'create',
      'catalog',
      'uploadImage',
      'catalog',
    ]);
    // The reload after the image may commit a render after the notice.
    await waitFor(() =>
      expect(within(rowOf('Raro')).getByRole('img', { name: 'Raro' })).toBeInTheDocument(),
    );
  });

  it('an image over 2 MB is refused here, without the crop nor a request', async () => {
    await open();
    const sheet = await startNew();
    await userEvent.upload(
      within(sheet).getByLabelText('Arquivo de imagem'),
      pngOf(2 * 1024 * 1024 + 1),
    );
    expect(within(sheet).getByText('A imagem passa de 2 MB.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Recortar a insígnia' })).not.toBeInTheDocument();
    expect(deps.badgesAdminApi.uploads).toEqual([]);
  });

  it('an image of exactly 2 MB goes to the crop', async () => {
    await open();
    const sheet = await startNew();
    await userEvent.upload(
      within(sheet).getByLabelText('Arquivo de imagem'),
      pngOf(2 * 1024 * 1024),
    );
    expect(await screen.findByRole('dialog', { name: 'Recortar a insígnia' })).toBeInTheDocument();
  });

  it('an image refused after the badge exists is told in the sheet and the row stays "Sem imagem"', async () => {
    deps.badgesAdminApi.answers.answer('uploadImage', {
      ok: false,
      failure: { kind: 'unsupported_image' },
    });
    await open();
    const sheet = await startNew();
    await frame(sheet, pngOf(1024));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Criar' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'A insígnia foi criada, mas a imagem não foi. Não deu para ler essa imagem. Use PNG, JPEG, WebP ou GIF.',
    );
    expect(rowOf('Raro')).toHaveTextContent('Sem imagem');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Voltar à lista' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('"Trocar imagem" of a row sends only the image of that badge', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Ações de Veterano' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Trocar imagem' }));
    await frame(document.body, pngOf(1024));
    expect(await screen.findByText('Imagem de “Veterano” enviada.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(deps.badgesAdminApi.uploads).toEqual([
      { badgeId: VETERAN_BADGE.id, file: expect.any(File), crop: SQUARE },
    ]);
    expect(deps.badgesAdminApi.answers.callsOf('create')).toEqual([]);
    expect(deps.badgesAdminApi.answers.callsOf('update')).toEqual([]);
  });

  it('"Enviar imagem" of a badge without one sends it and the row shows the image', async () => {
    deps.badgesAdminApi.put(FOUNDER_BADGE);
    await open();
    await userEvent.click(within(rowOf('Fundador')).getByRole('button', { name: 'Enviar imagem' }));
    await frame(document.body, pngOf(1024));
    expect(
      await within(rowOf('Fundador')).findByRole('img', { name: 'Fundador' }),
    ).toBeInTheDocument();
    expect(rowOf('Fundador')).not.toHaveTextContent('Sem imagem');
  });

  it('a row image refused by the server is told above the list', async () => {
    deps.badgesAdminApi.put(VETERAN_BADGE);
    deps.badgesAdminApi.answers.answer('uploadImage', {
      ok: false,
      failure: { kind: 'image_too_large' },
    });
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Ações de Veterano' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Trocar imagem' }));
    await frame(document.body, pngOf(1024));
    expect(await screen.findByRole('alert')).toHaveTextContent('A imagem passa de 2 MB.');
  });
});
