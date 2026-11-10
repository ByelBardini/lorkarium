import { sheetTemplateAssetPathDto } from '@lorkarium/contracts';
import { XIcon } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  declaredAssetsOf,
  templateAssetTypeOf,
  withManifestAsset,
  withoutManifestAsset,
} from '@/lib/sheet-manifest-assets';
import { readSheetManifestText } from '@/lib/sheet-template-manifest';
import type { SheetTemplatesApi } from '@/services/sheet-templates-api';
import { sheetTemplateFailureMessage } from './sheet-template-messages';

/** Where the editor sends and reads the template's fonts and images. */
export type SheetTemplateAssetPorts = Readonly<{
  api: Pick<SheetTemplatesApi, 'asset' | 'uploadAsset'>;
  campaignId: string;
}>;

export type SheetTemplateAssetsPanelProps = Readonly<{
  manifest: string;
  onManifest: (text: string) => void;
  ports: SheetTemplateAssetPorts | undefined;
}>;

const BAD_PATH =
  'Caminho inválido: pastas com /, letras sem acento, números, _ e -, terminando em .woff2, .png, .jpg, .jpeg ou .webp.';

/** The fonts and images the manifest declares: each by its path, with "Tirar"; and the form that
 *  sends a new file and declares it at the path typed (the CSS then names it `asset:<path>`).
 *  Nothing is offered while the manifest text does not read.
 *
 *  Example: `<SheetTemplateAssetsPanel manifest={draft.manifest} onManifest={(manifest) => onEdit({ manifest })} ports={ports} />` */
export function SheetTemplateAssetsPanel(props: SheetTemplateAssetsPanelProps): React.JSX.Element {
  const readable = readSheetManifestText(props.manifest).ok;
  return (
    <section aria-label="Assets do modelo" className="border-t border-border px-4 py-3 text-sm">
      <h3 className="mb-2 font-medium">Fontes e imagens</h3>
      <AssetList {...props} />
      {props.ports && readable ? (
        <AssetUploadForm {...props} ports={props.ports} />
      ) : (
        <p className="text-xs text-muted-foreground">
          {props.ports ? 'Corrija o manifesto para enviar assets.' : 'Sem envio de assets aqui.'}
        </p>
      )}
    </section>
  );
}

function AssetList({ manifest, onManifest }: SheetTemplateAssetsPanelProps): React.JSX.Element {
  const declared = declaredAssetsOf(manifest);
  if (declared.length === 0)
    return <p className="mb-2 text-xs text-muted-foreground">Nenhum asset declarado.</p>;
  const remove = (path: string): void => {
    const next = withoutManifestAsset(manifest, path);
    if (next !== null) onManifest(next);
  };
  return (
    <ul aria-label="Assets declarados" className="mb-3 flex flex-col gap-1">
      {declared.map(({ path }) => (
        <li key={path} className="flex items-center gap-2 font-mono text-xs">
          <span className="min-w-0 flex-1 truncate">{`asset:${path}`}</span>
          <Button
            aria-label={`Tirar ${path}`}
            variant="ghost"
            size="icon-sm"
            onClick={() => remove(path)}
          >
            <XIcon aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

type UploadFormProps = SheetTemplateAssetsPanelProps & Readonly<{ ports: SheetTemplateAssetPorts }>;

function AssetUploadForm(props: UploadFormProps): React.JSX.Element {
  const ids = { path: useId(), file: useId() };
  const [path, setPath] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setProblem(await sendAsset(props, path.trim(), file));
    setBusy(false);
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-2">
      <label htmlFor={ids.path} className="flex flex-col gap-1 text-xs">
        Caminho do asset
        <Input
          id={ids.path}
          value={path}
          placeholder="fontes/cormorant.woff2"
          onChange={(event) => setPath(event.target.value)}
          className="h-8 w-56 font-mono text-xs"
        />
      </label>
      <label htmlFor={ids.file} className="flex flex-col gap-1 text-xs">
        Arquivo do asset
        <input
          id={ids.file}
          type="file"
          accept=".woff2,.png,.jpg,.jpeg,.webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-xs"
        />
      </label>
      <Button type="submit" size="sm" disabled={busy || !file || path.trim() === ''}>
        {busy ? 'Enviando…' : 'Enviar asset'}
      </Button>
      {problem && (
        <p role="alert" className="basis-full text-xs text-destructive-text">
          {problem}
        </p>
      )}
    </form>
  );
}

// The refusal in words, or `null` when the asset was sent and declared.
async function sendAsset(props: UploadFormProps, path: string, file: File): Promise<string | null> {
  const type = templateAssetTypeOf(path);
  if (!sheetTemplateAssetPathDto.safeParse(path).success || !type) return BAD_PATH;
  const sent = await props.ports.api.uploadAsset(
    props.ports.campaignId,
    await file.arrayBuffer(),
    type,
  );
  if (!sent.ok) return sheetTemplateFailureMessage(sent.failure.kind);
  const next = withManifestAsset(props.manifest, { path, assetId: sent.value.id });
  if (next === null) return 'Corrija o manifesto para enviar assets.';
  props.onManifest(next);
  return null;
}
