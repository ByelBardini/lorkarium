import {
  SHEET_TEMPLATE_FILE_EXTENSION,
  SHEET_TEMPLATE_NAME_MAX_LENGTH,
  type SheetTemplateManifestDto,
} from '@lorkarium/contracts';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  SHEET_MANIFEST_NO_PERMISSIONS,
  sheetManifestBarsLabel,
  sheetManifestPermissionLabel,
} from '@/features/sheets/sheet-manifest-messages';
import { sheetSourceSizeLabel } from '@/features/sheets/sheet-template-messages';
import { sourceBytes } from '@/stores/sheet-template-draft-store';
import type {
  PendingSheetTemplateImport,
  SheetTemplateImporter,
} from './use-sheet-template-import';

const THIRD_PARTY_CODE_NOTE =
  'O código foi escrito por outra pessoa e roda isolado, sem acesso à rede nem à sua conta.';

/** The hidden file input, the refusal of a bad file and the confirmation of a good one.
 *
 *  Example: `<SheetTemplateImport importer={importer} live={live} />` */
export function SheetTemplateImport({
  importer,
  live,
}: Readonly<{ importer: SheetTemplateImporter; live: boolean }>): React.JSX.Element {
  return (
    <>
      <SheetTemplateFileInput attach={importer.attachInput} onFile={importer.readFile} />
      {importer.problem && (
        <p role="alert" className="shrink-0 px-6 py-2 text-sm text-destructive-text">
          {importer.problem}
        </p>
      )}
      {importer.pending && (
        <ImportSheetTemplateDialog importer={importer} pending={importer.pending} live={live} />
      )}
    </>
  );
}

type FileInputProps = Readonly<{
  attach: (input: HTMLInputElement | null) => void;
  onFile: (file: File | undefined) => Promise<void>;
}>;

function SheetTemplateFileInput({ attach, onFile }: FileInputProps) {
  return (
    <input
      ref={attach}
      type="file"
      accept={SHEET_TEMPLATE_FILE_EXTENSION}
      aria-label="Arquivo de modelo de ficha"
      className="sr-only"
      tabIndex={-1}
      onChange={(event) => {
        void onFile(event.target.files?.[0]);
        // The same file picked twice must fire `change` again.
        event.target.value = '';
      }}
    />
  );
}

type DialogProps = Readonly<{
  importer: SheetTemplateImporter;
  pending: PendingSheetTemplateImport;
  live: boolean;
}>;

function ImportSheetTemplateDialog({ importer, pending, live }: DialogProps) {
  const nameId = useId();
  const [name, setName] = useState(pending.template.name);
  const blocked = name.trim() === '' || !live || importer.sending;
  return (
    <Dialog open onOpenChange={(open) => !open && importer.cancel()}>
      <DialogContent>
        <DialogTitle>Importar modelo de ficha</DialogTitle>
        <DialogDescription>{THIRD_PARTY_CODE_NOTE}</DialogDescription>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!blocked) void importer.confirm(name.trim());
          }}
        >
          <label htmlFor={nameId}>Nome do modelo</label>
          <Input
            id={nameId}
            maxLength={SHEET_TEMPLATE_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <p aria-label="Tamanho do código" className="text-xs text-muted-foreground tabular-nums">
            {sheetSourceSizeLabel(sourceBytes(pending.template))}
          </p>
          <ManifestSummary manifest={pending.template.manifest} />
          <FileAssetsSummary count={pending.template.assets?.length ?? 0} />
          {importer.sendError && (
            <p role="alert" className="text-sm text-destructive-text">
              {importer.sendError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={importer.cancel}>
              Cancelar
            </Button>
            <Button type="submit" disabled={blocked}>
              {importer.sending ? 'Importando…' : 'Importar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// What the imported code may ask the table for, read before it is created.
function ManifestSummary({ manifest }: Readonly<{ manifest: SheetTemplateManifestDto }>) {
  const bars = sheetManifestBarsLabel(manifest);
  return (
    <div className="flex flex-col gap-1 text-sm">
      {manifest.permissions.length === 0 ? (
        <p className="text-muted-foreground">{SHEET_MANIFEST_NO_PERMISSIONS}</p>
      ) : (
        <ul aria-label="Permissões pedidas" className="list-disc pl-5">
          {manifest.permissions.map((permission) => (
            <li key={permission}>{sheetManifestPermissionLabel(permission)}</li>
          ))}
        </ul>
      )}
      {bars && <p className="text-muted-foreground">Barras esperadas: {bars}</p>}
    </div>
  );
}

function FileAssetsSummary({ count }: Readonly<{ count: number }>): React.JSX.Element | null {
  if (count === 0) return null;
  return (
    <p aria-label="Assets do arquivo" className="text-xs text-muted-foreground">
      {count === 1 ? '1 fonte ou imagem vai junto.' : `${count} fontes e imagens vão junto.`}
    </p>
  );
}
