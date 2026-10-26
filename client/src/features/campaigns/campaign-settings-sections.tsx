import {
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
  type CampaignCoverDto,
  type CampaignDetailDto,
  type CampaignStatusDto,
  type CampaignVisibilityDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { CoverPicker } from '@/components/cover-picker';
import { FormField } from '@/components/form-field';
import { ImagePicker } from '@/components/image-picker';
import { PasswordField } from '@/components/password-field';
import { SegmentField, type SegmentOption } from '@/components/segment-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PUBLIC_VISIBILITY_HINT } from './campaign-messages';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_HINT,
  CAMPAIGN_STATUS_LABEL,
} from '@/lib/campaign-status';
import type { AssetsApi } from '@/services/assets-api';
import type { Clipboard } from '@/services/clipboard';
import { CampaignTagsField, ContentWarningsField } from './campaign-label-fields';
import { DeleteCampaignDialog } from './delete-campaign-dialog';
import { JoinCodeSetting } from './join-code-setting';
import { SETTINGS_SECTIONS } from './settings-sections';
import type { SettingsDraft } from './use-campaign-settings-draft';

const STATUS_OPTIONS: readonly SegmentOption<CampaignStatusDto>[] = CAMPAIGN_STATUSES.map(
  (status) => ({ value: status, label: CAMPAIGN_STATUS_LABEL[status] }),
);

const VISIBILITY_OPTIONS: readonly SegmentOption<CampaignVisibilityDto>[] = [
  { value: 'private', label: 'Privada' },
  { value: 'public', label: 'Pública' },
];

const VISIBILITY_HINT: Readonly<Record<CampaignVisibilityDto, string>> = {
  private: 'Só entra quem tiver o código.',
  public: PUBLIC_VISIBILITY_HINT,
};

type SettingsSectionProps = Readonly<{
  /** The entry of `SETTINGS_SECTIONS`: the anchor the side menu jumps to, and the title. */
  section: Readonly<{ id: string; title: string }>;
  description: string;
  danger?: boolean;
  children: React.ReactNode;
}>;

function SettingsSection(props: SettingsSectionProps): React.JSX.Element {
  const titleId = useId();
  return (
    <section
      id={props.section.id}
      tabIndex={-1}
      aria-labelledby={titleId}
      className="flex scroll-mt-14 flex-col gap-5 border-t border-divider pt-6 outline-none first:border-t-0 first:pt-0 md:scroll-mt-6"
    >
      <div className="flex flex-col gap-1">
        <h2
          id={titleId}
          className={
            props.danger
              ? 'font-display text-xl font-semibold text-destructive-text'
              : 'font-display text-xl font-semibold'
          }
        >
          {props.section.title}
        </h2>
        <p className="text-[13px] text-muted-foreground">{props.description}</p>
      </div>
      {props.children}
    </section>
  );
}

export type GeneralSectionProps = Readonly<{
  draft: SettingsDraft;
  campaignId: string;
  assets: AssetsApi;
  /** The drawn cover "Usar capa desenhada" goes back to. */
  drawnCover: CampaignCoverDto;
}>;

/** "Geral": cover (drawn or an image sent to the campaign), name, system, status and "Sobre a mesa".
 *
 *  Example: `<GeneralSection draft={draft} campaignId={id} assets={assets} drawnCover={cover} />` */
export function GeneralSection({ draft, ...props }: GeneralSectionProps): React.JSX.Element {
  const { values, change } = draft;
  const imageId = values.cover.kind === 'image' ? values.cover.assetId : null;
  return (
    <SettingsSection
      section={SETTINGS_SECTIONS.general}
      description="O que aparece no hub e nos detalhes da mesa."
    >
      <span className="-mb-3 text-[13px] font-medium text-label">Capa</span>
      <CoverPicker
        value={values.cover}
        onChange={(cover) => change({ cover })}
        image={
          <ImagePicker
            campaignId={props.campaignId}
            purpose="cover"
            assets={props.assets}
            value={imageId}
            label="Imagem da capa"
            removeLabel="Usar capa desenhada"
            onChange={(asset) =>
              change({ cover: asset ? { kind: 'image', assetId: asset.id } : props.drawnCover })
            }
          />
        }
      />
      <NameAndSystemFields draft={draft} />
      <SegmentField
        legend="Status"
        value={values.status}
        options={STATUS_OPTIONS}
        onChange={(status) => change({ status })}
        hint={CAMPAIGN_STATUS_HINT[values.status]}
      />
      <DescriptionField draft={draft} />
    </SettingsSection>
  );
}

function NameAndSystemFields({ draft }: Readonly<{ draft: SettingsDraft }>): React.JSX.Element {
  const ids = { name: useId(), system: useId() };
  const { values, errors, change } = draft;
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField
        id={ids.name}
        label="Nome da mesa"
        error={errors.name}
        hint={`${values.name.length}/${CAMPAIGN_NAME_MAX_LENGTH}`}
      >
        <Input
          id={ids.name}
          value={values.name}
          onChange={(event) => change({ name: event.target.value })}
          aria-invalid={errors.name !== undefined}
          aria-describedby={errors.name ? `${ids.name}-error` : undefined}
        />
      </FormField>
      <FormField id={ids.system} label="Sistema" error={errors.system} hint="Opcional.">
        <Input
          id={ids.system}
          value={values.system}
          placeholder="D&D 5e, Tormenta20…"
          onChange={(event) => change({ system: event.target.value })}
          aria-invalid={errors.system !== undefined}
          aria-describedby={errors.system ? `${ids.system}-error` : undefined}
        />
      </FormField>
    </div>
  );
}

function DescriptionField({ draft }: Readonly<{ draft: SettingsDraft }>): React.JSX.Element {
  const id = useId();
  const { values, errors, change } = draft;
  return (
    <FormField
      id={id}
      label="Sobre a mesa"
      error={errors.description}
      hint={`${values.description.length}/${CAMPAIGN_DESCRIPTION_MAX_LENGTH}`}
    >
      <Textarea
        id={id}
        value={values.description}
        placeholder="Do que se trata a campanha, o clima, quando joga…"
        onChange={(event) => change({ description: event.target.value })}
        aria-invalid={errors.description !== undefined}
        aria-describedby={errors.description ? `${id}-error` : undefined}
      />
    </FormField>
  );
}

/** "Conteúdo": the content warnings and the free tags.
 *
 *  Example: `<ContentSection draft={draft} />` */
export function ContentSection({ draft }: Readonly<{ draft: SettingsDraft }>): React.JSX.Element {
  const { values, change } = draft;
  return (
    <SettingsSection
      section={SETTINGS_SECTIONS.content}
      description="O clima da mesa, antes de alguém entrar."
    >
      <ContentWarningsField
        value={values.contentWarnings}
        onChange={(contentWarnings) => change({ contentWarnings })}
      />
      <CampaignTagsField value={values.tags} onChange={(tags) => change({ tags })} />
    </SettingsSection>
  );
}

export type AccessSectionProps = Readonly<{
  draft: SettingsDraft;
  campaign: CampaignDetailDto;
  clipboard: Clipboard;
}>;

/** "Acesso": visibility, the password switch (kept, replaced or removed) and the join code.
 *
 *  Example: `<AccessSection draft={draft} campaign={campaign} clipboard={clipboard} />` */
export function AccessSection({ draft, campaign, clipboard }: AccessSectionProps) {
  const { values, change } = draft;
  return (
    <SettingsSection section={SETTINGS_SECTIONS.access} description="Quem consegue entrar e como.">
      <SegmentField
        legend="Visibilidade"
        value={values.visibility}
        options={VISIBILITY_OPTIONS}
        onChange={(visibility) => change({ visibility })}
        hint={VISIBILITY_HINT[values.visibility]}
      />
      <PasswordSetting draft={draft} hasPassword={campaign.hasPassword} />
      {campaign.joinCode && (
        <JoinCodeSetting campaignId={campaign.id} code={campaign.joinCode} clipboard={clipboard} />
      )}
    </SettingsSection>
  );
}

type PasswordSettingProps = Readonly<{ draft: SettingsDraft; hasPassword: boolean }>;

function PasswordSetting({ draft, hasPassword }: PasswordSettingProps): React.JSX.Element {
  const ids = { toggle: useId(), password: useId() };
  const { values, errors, change } = draft;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={ids.toggle} className="text-sm text-foreground">
          Pedir senha para entrar
        </Label>
        <Switch
          id={ids.toggle}
          checked={values.requirePassword}
          onCheckedChange={(requirePassword) => change({ requirePassword, password: '' })}
        />
      </div>
      {values.requirePassword && (
        <FormField
          id={ids.password}
          label={hasPassword ? 'Nova senha' : 'Senha da mesa'}
          error={errors.password}
          hint={hasPassword ? 'Deixe em branco para manter a senha atual.' : undefined}
        >
          <PasswordField
            id={ids.password}
            value={values.password}
            onValueChange={(password) => change({ password })}
            invalid={errors.password !== undefined}
            describedBy={errors.password ? `${ids.password}-error` : undefined}
            autoComplete="new-password"
            autoFocus={!hasPassword}
          />
        </FormField>
      )}
    </div>
  );
}

type DangerSectionProps = Readonly<{ campaignId: string; campaignName: string }>;

/** "Zona de perigo": only "Excluir mesa", confirmed by typing the name.
 *
 *  Example: `<DangerSection campaignId={campaign.id} campaignName={campaign.name} />` */
export function DangerSection(props: DangerSectionProps): React.JSX.Element {
  const [deleting, setDeleting] = useState(false);
  return (
    <SettingsSection section={SETTINGS_SECTIONS.danger} description="O que não tem volta." danger>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-foreground">Excluir mesa</span>
          <span className="text-[13px] text-muted-foreground">
            Apaga grids, tokens, fichas e desenhos. Não tem volta.
          </span>
        </div>
        <Button type="button" variant="destructive" size="lg" onClick={() => setDeleting(true)}>
          Excluir mesa
        </Button>
      </div>
      {deleting && <DeleteCampaignDialog {...props} onClose={() => setDeleting(false)} />}
    </SettingsSection>
  );
}
