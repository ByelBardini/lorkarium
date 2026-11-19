import { Loader2Icon } from 'lucide-react';
import { useContext, useMemo } from 'react';
import { CampaignPreviewCard, type CampaignPreview } from '@/components/campaign-preview-card';
import { CustomColorLocksContext } from '@/components/color-picker/custom-color-locks';
import { CoverPicker } from '@/components/cover-picker';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { commandFailureMessage } from '@/features/campaigns/campaign-messages';
import { featureGate, type PlanGate } from '@/features/plans/plan-gate';
import { usePlanLimits } from '@/features/plans/use-plan-limits';
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
  const gates = useCreatePlanGates();
  const form = useCreateCampaignForm(props.onSubmit, gates.private.open ? 'private' : 'public');
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
        <CreateFields form={form} privateLock={gates.private.hint} />
      </div>
      <aside className="flex flex-col gap-6 md:col-start-1 md:row-span-2 md:row-start-1">
        <CoverChoice form={form} art={gates.art} color={gates.color} />
        <CampaignPreviewCard campaign={previewOf(form.values)} className="md:order-first" />
      </aside>
      <FormButtons submitting={props.submitting} onCancel={props.onCancel} />
    </form>
  );
}

type CreatePlanGates = Readonly<{ private: PlanGate; art: PlanGate; color: PlanGate }>;

// The creator becomes the owner: the table's limits are the creator's own.
function useCreatePlanGates(): CreatePlanGates {
  const limits = usePlanLimits().account?.limits ?? null;
  return {
    private: featureGate(limits, (granted) => granted.privateCampaign),
    art: featureGate(limits, (granted) => granted.campaignArt),
    color: featureGate(limits, (granted) => granted.customColor),
  };
}

type CreateFieldsProps = Readonly<{ form: CreateCampaignFormState; privateLock: string | null }>;

function CreateFields({ form, privateLock }: CreateFieldsProps): React.JSX.Element {
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
        privateLock={privateLock}
      />
      <CampaignPasswordField
        binding={bind('password')}
        enabled={values.usePassword}
        onEnabledChange={setUsePassword}
      />
    </>
  );
}

type CoverChoiceProps = Readonly<{
  form: CreateCampaignFormState;
  art: PlanGate;
  color: PlanGate;
}>;

// No table yet: the cover's custom tone follows the creator's plan, given as the table's lock.
function CoverChoice({ form, art, color }: CoverChoiceProps): React.JSX.Element {
  const outer = useContext(CustomColorLocksContext);
  const locks = useMemo(() => ({ ...outer, table: color.hint }), [outer, color.hint]);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-semibold text-label">Capa</span>
      <CustomColorLocksContext value={locks}>
        <CoverPicker
          value={form.values.cover}
          onChange={(cover) => cover.kind === 'drawn' && form.change({ cover })}
          hint={art.open ? COVER_LATER_HINT : PHOTO_LATER_HINT}
        />
      </CustomColorLocksContext>
    </div>
  );
}

const COVER_LATER_HINT = 'Dá para enviar uma imagem depois, nas configurações da mesa.';
const PHOTO_LATER_HINT = 'Com uma foto da mesa, enviada nas configurações, a capa usa a foto.';

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
  const message = commandFailureMessage(failure);
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
