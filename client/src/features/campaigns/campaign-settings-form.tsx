import type { CampaignDetailDto, DrawnCampaignCoverDto } from '@lorkarium/contracts';
import type { FormEvent } from 'react';
import { CampaignPreviewCard } from '@/components/campaign-preview-card';
import { UnsavedChangesBar } from '@/components/unsaved-changes-bar';
import { fallbackCoverOf } from '@/lib/campaign-cover';
import {
  unsavedChangesStateOf,
  useSavedNotice,
  type UnsavedChangesState,
} from '@/lib/unsaved-changes';
import type { AssetsApi } from '@/services/assets-api';
import type { Clipboard } from '@/services/clipboard';
import { commandFailureMessage } from './campaign-messages';
import {
  AccessSection,
  ContentSection,
  DangerSection,
  GeneralSection,
  PlayersSection,
} from './campaign-settings-sections';
import { DiscardSettingsDialog } from './discard-settings-dialog';
import { SettingsSectionNav } from './settings-section-nav';
import { useCampaignSettingsDraft, type SettingsDraft } from './use-campaign-settings-draft';
import {
  settingsFailureOf,
  useOnSettingsSettled,
  useSettingsFetcher,
} from './use-settings-fetcher';

export type CampaignSettingsFormProps = Readonly<{
  campaign: CampaignDetailDto;
  assets: AssetsApi;
  clipboard: Clipboard;
}>;

/** "Configurações da mesa" (master only): the section menu, then Geral, Conteúdo, Acesso, Permissões
 *  dos jogadores and Zona de perigo in one form, with the hub preview beside from `lg`. The fields wait in a draft for
 *  the bar; leaving with edits asks first. The code and the deletion are commands of their own,
 *  outside the bar.
 *
 *  Example: `<CampaignSettingsForm campaign={campaign} assets={assets} clipboard={clipboard} />` */
export function CampaignSettingsForm({
  campaign,
  assets,
  clipboard,
}: CampaignSettingsFormProps): React.JSX.Element {
  const draft = useCampaignSettingsDraft(campaign);
  const save = useSettingsSave(campaign.id, draft);
  return (
    <>
      <form
        noValidate
        aria-label="Configurações da mesa"
        aria-busy={save.saving}
        onSubmit={save.submit}
        className="grid gap-x-10 gap-y-6 md:grid-cols-[11rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)_18rem] xl:grid-cols-[14rem_minmax(0,1fr)_24rem] 2xl:grid-cols-[16rem_minmax(0,1fr)_28rem] 2xl:gap-x-16"
      >
        <SettingsSectionNav />
        <div className="flex min-w-0 flex-col gap-6 pb-8">
          <GeneralSection
            draft={draft}
            campaignId={campaign.id}
            assets={assets}
            drawnCover={drawnCoverOf(campaign)}
          />
          <ContentSection draft={draft} />
          <AccessSection draft={draft} campaign={campaign} clipboard={clipboard} />
          <PlayersSection draft={draft} />
          <DangerSection campaignId={campaign.id} campaignName={campaign.name} />
        </div>
        <SettingsPreview draft={draft} />
        {save.barState && (
          <UnsavedChangesBar
            label="Alterações da mesa"
            className="col-span-full -mx-4 px-4 sm:-mx-8 sm:px-8"
            state={save.barState}
            invalid={draft.update === null}
            failureMessage={save.failureMessage}
            onDiscard={draft.discard}
          />
        )}
      </form>
      <DiscardSettingsDialog dirty={draft.dirty} />
    </>
  );
}

function SettingsPreview({ draft }: Readonly<{ draft: SettingsDraft }>): React.JSX.Element {
  const { values } = draft;
  return (
    <div className="hidden lg:block">
      <CampaignPreviewCard
        label="Como aparece no hub"
        className="sticky top-6"
        campaign={{ ...values, hasPassword: values.requirePassword }}
      />
    </div>
  );
}

// "Usar capa desenhada" goes back to the stored drawing, or the id's drawing after an image.
function drawnCoverOf(campaign: CampaignDetailDto): DrawnCampaignCoverDto {
  return campaign.cover.kind === 'drawn' ? campaign.cover : fallbackCoverOf(campaign.id);
}

type SettingsSave = Readonly<{
  saving: boolean;
  barState: UnsavedChangesState | null;
  failureMessage: string | null;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}>;

function useSettingsSave(campaignId: string, draft: SettingsDraft): SettingsSave {
  const fetcher = useSettingsFetcher(campaignId);
  const notice = useSavedNotice();
  const failure = settingsFailureOf(fetcher.settled);
  useOnSettingsSettled(fetcher.settled, (result) => {
    if (!('done' in result)) return;
    draft.discard();
    notice.showSaved();
  });
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (draft.update) fetcher.send({ intent: 'update', input: draft.update });
  };
  return {
    saving: fetcher.busy,
    barState: unsavedChangesStateOf({
      saving: fetcher.busy,
      dirty: draft.dirty,
      justSaved: notice.justSaved,
    }),
    failureMessage: failure && draft.dirty ? commandFailureMessage(failure) : null,
    submit,
  };
}
