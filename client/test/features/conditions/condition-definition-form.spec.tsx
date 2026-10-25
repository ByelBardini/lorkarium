import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  NEW_CONDITION_VALUES,
  type ConditionFormValues,
} from '@/features/conditions/condition-catalog-link';
import { ConditionDefinitionForm } from '@/features/conditions/condition-definition-form';
import type { BoardCommandResult } from '@/services/table-board-commands';
import { AssetsApiFake, LYRA_PORTRAIT } from '../../support/assets-api-fake';
import { VHARN } from '../../support/campaigns-api-fake';

const ENVENENADO: ConditionFormValues = {
  name: 'Envenenado',
  tone: 'harm',
  icon: 'skull',
  look: null,
  description: 'Desvantagem.',
  maxStacks: null,
  color: null,
  imageAssetId: null,
};

// Plays the parent: keeps what each submit sent and answers `answer` (ok by default); `hold()`
// keeps the next answer pending until `release()`.
class SubmitRecorder {
  readonly submitted: ConditionFormValues[] = [];
  answer: BoardCommandResult = { ok: true, version: 5 };
  cancels = 0;
  private holding = false;
  private pending: (() => void) | null = null;

  hold(): void {
    this.holding = true;
  }

  release(): void {
    this.pending?.();
    this.pending = null;
  }

  submit = (values: ConditionFormValues): Promise<BoardCommandResult> => {
    this.submitted.push(values);
    if (!this.holding) return Promise.resolve(this.answer);
    this.holding = false;
    return new Promise((resolve) => {
      this.pending = () => resolve(this.answer);
    });
  };

  cancel = (): void => {
    this.cancels += 1;
  };
}

// Plays the sheet that holds the form: notes each Esc that reaches it and whether the form took it.
class EscapeWatcher {
  readonly escapes: { prevented: boolean }[] = [];

  keyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') this.escapes.push({ prevented: event.defaultPrevented });
  };
}

let parent: SubmitRecorder;
let assets: AssetsApiFake;

beforeEach(() => {
  parent = new SubmitRecorder();
  assets = new AssetsApiFake();
});

// Where the image field sends the master's picture: VHARN's assets, played by the fake.
const images = () => ({ campaignId: VHARN.id, assets });

function renderEdit(initial: ConditionFormValues = ENVENENADO): HTMLElement {
  render(
    <ConditionDefinitionForm
      mode="edit"
      label="Envenenado"
      initial={initial}
      onSubmit={parent.submit}
      images={images()}
    />,
  );
  return screen.getByRole('form', { name: 'Envenenado' });
}

function renderEditInside(holder: EscapeWatcher, initial: ConditionFormValues = ENVENENADO): void {
  render(
    <div onKeyDown={holder.keyDown}>
      <ConditionDefinitionForm
        mode="edit"
        label="Envenenado"
        initial={initial}
        onSubmit={parent.submit}
        images={images()}
      />
    </div>,
  );
}

function renderNew(): HTMLElement {
  render(
    <ConditionDefinitionForm
      mode="new"
      label="Nova condição"
      initial={NEW_CONDITION_VALUES}
      onSubmit={parent.submit}
      images={images()}
      onCancel={parent.cancel}
    />,
  );
  return screen.getByRole('form', { name: 'Nova condição' });
}

function nameField(): HTMLElement {
  return screen.getByLabelText('Nome');
}

function descriptionField(): HTMLElement {
  return screen.getByLabelText('Descrição');
}

function button(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

// The tag beside "No token:", as the token would wear the condition.
function preview(): HTMLElement {
  const tag = screen.getByText('No token:').nextElementSibling;
  if (!(tag instanceof HTMLElement)) throw new Error('expected the preview tag after "No token:"');
  return tag;
}

describe('ConditionDefinitionForm (edit)', () => {
  it('starts at the condition: name, icon, nature, look and description, nothing focused', () => {
    const form = renderEdit();
    expect(within(form).getByRole('heading', { level: 2 })).toHaveTextContent('Envenenado');
    expect(nameField()).toHaveValue('Envenenado');
    expect(nameField()).not.toHaveFocus();
    expect(within(form).getByRole('button', { name: 'Ícone: Caveira' })).toBeInTheDocument();
    const natures = within(form).getByRole('radiogroup', { name: 'Natureza' });
    expect(within(natures).getByRole('radio', { name: 'Prejudicial' })).toBeChecked();
    const looks = within(form).getByRole('radiogroup', { name: 'Aparência no token' });
    expect(within(looks).getByRole('radio', { name: 'Nenhuma' })).toBeChecked();
    expect(descriptionField()).toHaveValue('Desvantagem.');
  });

  it('unchanged, "Salvar alterações" and "Descartar" are disabled', () => {
    renderEdit();
    expect(button('Salvar alterações')).toBeDisabled();
    expect(button('Descartar')).toBeDisabled();
  });

  it('a change enables "Salvar alterações" and "Descartar"', async () => {
    renderEdit();
    await userEvent.click(screen.getByRole('radio', { name: 'Incapacitante' }));
    expect(button('Salvar alterações')).toBeEnabled();
    expect(button('Descartar')).toBeEnabled();
  });

  it('only spaces around the saved name is no change: both stay disabled', async () => {
    renderEdit();
    await userEvent.type(nameField(), '  ');
    expect(button('Salvar alterações')).toBeDisabled();
    expect(button('Descartar')).toBeDisabled();
  });

  it('"Descartar" goes back to the saved values and disables itself again', async () => {
    renderEdit();
    await userEvent.type(nameField(), ' forte');
    await userEvent.clear(descriptionField());
    await userEvent.click(button('Descartar'));
    expect(nameField()).toHaveValue('Envenenado');
    expect(descriptionField()).toHaveValue('Desvantagem.');
    expect(button('Descartar')).toBeDisabled();
    expect(parent.submitted).toEqual([]);
  });

  it('Esc in a changed field goes back to the saved values, sends nothing and keeps the key', async () => {
    const holder = new EscapeWatcher();
    renderEditInside(holder);
    await userEvent.type(descriptionField(), ' Muito.{Escape}');
    expect(descriptionField()).toHaveValue('Desvantagem.');
    expect(parent.submitted).toEqual([]);
    expect(holder.escapes).toEqual([{ prevented: true }]);
  });

  it('Esc on an untouched edit is left to whoever holds the form', async () => {
    const holder = new EscapeWatcher();
    renderEditInside(holder);
    await userEvent.type(descriptionField(), '{Escape}');
    expect(holder.escapes).toEqual([{ prevented: false }]);
    expect(descriptionField()).toHaveValue('Desvantagem.');
  });

  it('"Salvar alterações" sends the edited values once, name and description trimmed', async () => {
    renderEdit();
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), '  Muito envenenado  ');
    await userEvent.click(screen.getByRole('radio', { name: 'Incapacitante' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Translúcido' }));
    await userEvent.clear(descriptionField());
    await userEvent.type(descriptionField(), '  Não age.  ');
    await userEvent.click(button('Salvar alterações'));
    expect(parent.submitted).toEqual([
      {
        name: 'Muito envenenado',
        tone: 'incapacitating',
        icon: 'skull',
        look: 'invisible',
        description: 'Não age.',
        maxStacks: null,
        color: null,
        imageAssetId: null,
      },
    ]);
  });

  it('while the server answers it reads "Salvando…" and a second submit sends nothing', async () => {
    renderEdit();
    await userEvent.type(nameField(), ' forte');
    parent.hold();
    await userEvent.click(button('Salvar alterações'));
    expect(button('Salvando…')).toBeDisabled();
    await userEvent.type(nameField(), '{Enter}');
    expect(parent.submitted).toHaveLength(1);
  });

  it('an empty name (only spaces) disables saving and says "Informe o nome."', async () => {
    const form = renderEdit();
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), '   ');
    expect(button('Salvar alterações')).toBeDisabled();
    expect(form).toHaveTextContent('Informe o nome.');
    await userEvent.type(nameField(), '{Enter}');
    expect(parent.submitted).toEqual([]);
  });

  it('the description counts its characters out of 500', async () => {
    const form = renderEdit();
    expect(form).toHaveTextContent('12/500');
    await userEvent.type(descriptionField(), '!');
    expect(form).toHaveTextContent('13/500');
  });

  it('a taken name says so under the name and keeps what was typed', async () => {
    parent.answer = { ok: false, failure: 'name_taken' };
    renderEdit();
    await userEvent.clear(nameField());
    await userEvent.type(nameField(), 'Cego');
    await userEvent.click(button('Salvar alterações'));
    expect(nameField()).toHaveAccessibleDescription('Já há uma condição com esse nome.');
    expect(nameField()).toHaveAttribute('aria-invalid', 'true');
    expect(nameField()).toHaveValue('Cego');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('typing again after a taken name clears the error', async () => {
    parent.answer = { ok: false, failure: 'name_taken' };
    renderEdit();
    await userEvent.type(nameField(), ' forte');
    await userEvent.click(button('Salvar alterações'));
    await userEvent.type(nameField(), 's');
    expect(nameField()).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText('Já há uma condição com esse nome.')).toBeNull();
  });

  it('another refusal reads as an alert in the footer, the values kept', async () => {
    parent.answer = { ok: false, failure: 'forbidden' };
    renderEdit();
    await userEvent.type(nameField(), ' forte');
    await userEvent.click(button('Salvar alterações'));
    expect(screen.getByRole('alert')).toHaveTextContent('Só o mestre pode fazer isso.');
    expect(nameField()).toHaveValue('Envenenado forte');
  });

  it('the action passed in (e.g. "Excluir") sits in the header', () => {
    render(
      <ConditionDefinitionForm
        mode="edit"
        label="Envenenado"
        initial={ENVENENADO}
        action={<button type="button">Excluir Envenenado</button>}
        onSubmit={parent.submit}
        images={images()}
      />,
    );
    const form = screen.getByRole('form', { name: 'Envenenado' });
    expect(within(form).getByRole('button', { name: 'Excluir Envenenado' })).toBeInTheDocument();
  });
});

describe('ConditionDefinitionForm (new)', () => {
  it('starts empty with the name focused, "Criar condição" disabled', () => {
    renderNew();
    expect(nameField()).toHaveValue('');
    expect(nameField()).toHaveFocus();
    expect(button('Criar condição')).toBeDisabled();
  });

  it('"Criar condição" sends the typed values once, trimmed', async () => {
    renderNew();
    await userEvent.type(nameField(), ' Sangrando ');
    await userEvent.type(descriptionField(), ' Perde 1 PV. ');
    await userEvent.click(button('Criar condição'));
    expect(parent.submitted).toEqual([
      { ...NEW_CONDITION_VALUES, name: 'Sangrando', description: 'Perde 1 PV.' },
    ]);
  });

  it('"Cancelar", even untouched, gives up through onCancel and sends nothing', async () => {
    renderNew();
    await userEvent.click(button('Cancelar'));
    expect(parent.cancels).toBe(1);
    expect(parent.submitted).toEqual([]);
  });

  it('Esc in a field gives up through onCancel and sends nothing', async () => {
    renderNew();
    await userEvent.type(nameField(), 'Sangr{Escape}');
    expect(parent.cancels).toBe(1);
    expect(parent.submitted).toEqual([]);
  });
});

describe('ConditionDefinitionForm preview', () => {
  it('the tag "No token:" shows the typed name as it is typed', async () => {
    renderEdit();
    expect(preview()).toHaveTextContent('Envenenado');
    await userEvent.type(nameField(), ' forte');
    expect(preview()).toHaveTextContent('Envenenado forte');
  });

  it('with no name the tag reads "Sem nome"', () => {
    renderNew();
    expect(preview()).toHaveTextContent('Sem nome');
  });

  it('switching the nature to Benéfica switches the tag to the benefit look', async () => {
    renderEdit();
    expect(preview()).toHaveClass('border-destructive/60');
    await userEvent.click(screen.getByRole('radio', { name: 'Benéfica' }));
    expect(preview()).toHaveClass('border-primary/45');
    expect(preview()).not.toHaveClass('border-destructive/60');
  });
});

describe('ConditionDefinitionForm image', () => {
  const pictured: ConditionFormValues = { ...ENVENENADO, imageAssetId: LYRA_PORTRAIT.id };

  async function choosePng(): Promise<File> {
    const png = new File([new Uint8Array(64)], 'cego.png', { type: 'image/png' });
    await userEvent.upload(screen.getByLabelText('Arquivo de imagem'), png);
    return png;
  }

  it('a PNG chosen in "Imagem" goes up as a condition image and shows in the preview', async () => {
    renderEdit();
    const png = await choosePng();
    expect(assets.sent).toEqual([
      { kind: 'upload', campaignId: VHARN.id, file: png, purpose: 'condition' },
    ]);
    expect(preview().querySelector('img')).toHaveAttribute(
      'src',
      `/api/assets/${LYRA_PORTRAIT.id}`,
    );
  });

  it('"Salvar alterações" after choosing an image sends the asset the server kept', async () => {
    renderEdit();
    await choosePng();
    await userEvent.click(button('Salvar alterações'));
    expect(parent.submitted).toEqual([{ ...ENVENENADO, imageAssetId: LYRA_PORTRAIT.id }]);
  });

  it('"Voltar ao ícone" takes the image off: the preview shows the glyph and saving sends null', async () => {
    renderEdit(pictured);
    expect(preview().querySelector('img')).not.toBeNull();
    await userEvent.click(button('Voltar ao ícone'));
    expect(preview().querySelector('img')).toBeNull();
    expect(preview().querySelector('[data-icon="skull"]')).not.toBeNull();
    await userEvent.click(button('Salvar alterações'));
    expect(parent.submitted).toEqual([{ ...ENVENENADO, imageAssetId: null }]);
  });

  it('"Criar condição" with an image sends its asset', async () => {
    renderNew();
    await userEvent.type(nameField(), 'Cego');
    await choosePng();
    await userEvent.click(button('Criar condição'));
    expect(parent.submitted).toEqual([
      { ...NEW_CONDITION_VALUES, name: 'Cego', imageAssetId: LYRA_PORTRAIT.id },
    ]);
  });

  it('changing only the image enables "Salvar alterações" and "Descartar" and marks the form dirty', async () => {
    const form = renderEdit();
    await choosePng();
    expect(button('Salvar alterações')).toBeEnabled();
    expect(button('Descartar')).toBeEnabled();
    expect(form).toHaveAttribute('data-dirty');
  });

  it('the field says the icon shows when the image does not load', () => {
    renderEdit();
    expect(screen.getByText('O ícone aparece se a imagem não carregar.')).toBeInTheDocument();
  });

  it('a GIF is refused before sending, asking for PNG, JPEG or WebP', async () => {
    renderEdit();
    const gif = new File([new Uint8Array(64)], 'cego.gif', { type: 'image/gif' });
    fireEvent.change(screen.getByLabelText('Arquivo de imagem'), { target: { files: [gif] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Use PNG, JPEG ou WebP.');
    expect(assets.sent).toEqual([]);
  });

  it('an image the server refuses says why and keeps what was typed, no image chosen', async () => {
    renderEdit();
    await userEvent.type(nameField(), ' forte');
    assets.answerWith({ ok: false, failure: { kind: 'unsupported' } });
    await act(async () => {
      await choosePng();
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Use PNG, JPEG ou WebP.');
    expect(nameField()).toHaveValue('Envenenado forte');
    expect(preview().querySelector('img')).toBeNull();
  });
});
