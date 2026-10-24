import { Loader2Icon } from 'lucide-react';
import { CampaignPreviewCard, type CampaignPreview } from '@/components/campaign-preview-card';
import { CoverPicker } from '@/components/cover-picker';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { failureMessage } from '@/features/campaigns/campaign-messages';
import type { CampaignsFailure } from '@/services/campaigns-api';
import {
  CampaignAboutField,
  CampaignNameField,
  CampaignPasswordField,
  CampaignStatusField,
  CampaignSystemField,
} from './create-campaign-fields';
import type { CreateValues } from './create-campaign-messages';
import {
  useCreateCampaignForm,
  type CreateCampaignFormState,
  type CreateCampaignSubmission,
} from './use-create-campaign-form';
import { VisibilityField } from './visibility-field';

export type CreateCampaignFormProps = Readonly<{
  submitting: boolean;
  failure: CampaignsFailure | null;
  onSubmit: (submission: CreateCampaignSubmission) => void;
  onCancel: () => void;
}>;

/** The "Nova mesa" form in two columns: the live preview and the cover on the left, the fields on
 *  the right; below `md` one column, the cover and the preview after the fields. Validates by the
 *  contracts DTO and hands the normalized body up.
 *
 *  Example: `<CreateCampaignForm submitting={busy} failure={null} onSubmit={send} onCancel={close} />` */
export function CreateCampaignForm(props: CreateCampaignFormProps): React.JSX.Element {
  const form = useCreateCampaignForm(props.onSubmit);
  return (
    <form
      noValidate
      aria-label="Nova mesa"
      aria-busy={props.submitting}
      onSubmit={form.submit}
      className="grid gap-6 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] md:gap-x-8"
    >
      <div className="flex flex-col gap-5 md:col-start-2">
        {props.failure && <CreateFailure failure={props.failure} />}
        <CreateFields form={form} />
      </div>
      <aside className="flex flex-col gap-6 md:col-start-1 md:row-span-2 md:row-start-1">
        <CoverChoice form={form} />
        <CampaignPreviewCard campaign={previewOf(form.values)} className="md:order-first" />
      </aside>
      <FormButtons submitting={props.submitting} onCancel={props.onCancel} />
    </form>
  );
}

function CreateFields({ form }: Readonly<{ form: CreateCampaignFormState }>): React.JSX.Element {
  const { values, bind, change } = form;
  const setUsePassword = (usePassword: boolean): void =>
    change(usePassword ? { usePassword } : { usePassword, password: '' });
  return (
    <>
      <CampaignNameField binding={bind('name')} />
      <CampaignSystemField binding={bind('system')} />
      <CampaignStatusField value={values.status} onChange={(status) => change({ status })} />
      <CampaignAboutField binding={bind('description')} />
      <VisibilityField
        value={values.visibility}
        onChange={(visibility) => change({ visibility })}
      />
      <CampaignPasswordField
        binding={bind('password')}
        enabled={values.usePassword}
        onEnabledChange={setUsePassword}
      />
    </>
  );
}

function CoverChoice({ form }: Readonly<{ form: CreateCampaignFormState }>): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-label">Capa</span>
      <CoverPicker
        value={form.values.cover}
        onChange={(cover) => cover.kind === 'drawn' && form.change({ cover })}
        hint="Dá para enviar uma imagem depois, nas configurações da mesa."
      />
    </div>
  );
}

function previewOf(values: CreateValues): CampaignPreview {
  return {
    name: values.name,
    system: values.system,
    status: values.status,
    description: values.description,
    visibility: values.visibility,
    hasPassword: values.usePassword,
    cover: values.cover,
    contentWarnings: [],
    tags: [],
  };
}

function CreateFailure({ failure }: Readonly<{ failure: CampaignsFailure }>): React.JSX.Element {
  const message =
    failure.kind === 'invalid'
      ? 'Confira os campos e tente de novo.'
      : failureMessage(failure.kind);
  return (
    <Alert variant="destructive" className="px-3.5 py-3 text-sm">
      {message}
    </Alert>
  );
}

type FormButtonsProps = Readonly<{ submitting: boolean; onCancel: () => void }>;

function FormButtons({ submitting, onCancel }: FormButtonsProps): React.JSX.Element {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end md:col-start-2">
      <Button type="button" variant="outline" size="lg" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" size="lg" disabled={submitting}>
        {submitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {submitting ? 'Criando…' : 'Criar mesa'}
      </Button>
    </div>
  );
}
