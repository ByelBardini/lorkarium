import { SHEET_TEMPLATE_ENTRY_PATH, sheetTemplateFileKindOf } from '@lorkarium/contracts';
import { lazy, Suspense, useState } from 'react';
import type { CodeLanguage } from '@/code-editor/code-editor-setup';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { sheetSdkCompletionSource } from '@/lib/sheet-sdk-completions';
import { editTemplateFile, type TemplateFile } from '@/lib/sheet-template-files';
import { readSheetManifestText } from '@/lib/sheet-template-manifest';
import type { TemplateDraft } from '@/stores/sheet-template-draft-store';
import { SDK_CALLS } from './sheet-api-reference-content';
import { SheetFileTree } from './sheet-file-tree';
import {
  SheetTemplateAssetsPanel,
  type SheetTemplateAssetPorts,
} from './sheet-template-assets-panel';
import { sheetManifestProblemMessage } from './sheet-manifest-messages';

const CodeEditor = lazy(() => import('@/code-editor/code-editor'));

const LANGUAGE_OF_KIND: Readonly<Record<'html' | 'css' | 'js', CodeLanguage>> = {
  html: 'html',
  css: 'css',
  js: 'javascript',
};

// The SDK only exists in the JS files: the HTML and the manifest get no suggestion.
const SDK_COMPLETIONS = sheetSdkCompletionSource(SDK_CALLS);

/** The editor's tabs (code and preview): the active one is a lighter surface over the gold
 *  underline, so it reads at a glance against the dark code. */
export const EDITOR_TAB_CLASS =
  'h-9 rounded-none px-3 font-mono text-xs tracking-wide hover:bg-muted/60 data-[state=active]:bg-card data-[state=active]:text-primary';

export type SheetCodeTabsProps = Readonly<{
  draft: TemplateDraft;
  onEdit: (changes: Partial<TemplateDraft>) => void;
  /** Sends the fonts and images the manifest declares; without it, the manifest only lists them. */
  assetPorts?: SheetTemplateAssetPorts;
}>;

/** The files of a template (a list to pick, create, rename, remove and reorder, and the editor of
 *  the picked one) and its manifest, one tab each. Every editor stays mounted (hidden when not
 *  shown), so switching keeps each text and its undo history; a manifest the contract refuses is
 *  said under its editor (the save stays blocked by the draft).
 *
 *  Example: `<SheetCodeTabs draft={model.draft} onEdit={model.edit} />` */
export function SheetCodeTabs({
  draft,
  onEdit,
  assetPorts,
}: SheetCodeTabsProps): React.JSX.Element {
  return (
    <Tabs defaultValue="files" className="min-h-0 flex-1">
      <TabsList aria-label="Código do modelo" className="gap-0 bg-panel px-2">
        <TabsTrigger value="files" className={EDITOR_TAB_CLASS}>
          Arquivos
        </TabsTrigger>
        <TabsTrigger value="manifest" className={EDITOR_TAB_CLASS}>
          Manifesto
        </TabsTrigger>
      </TabsList>
      <Suspense
        fallback={
          <p role="status" className="p-4 text-sm text-muted-foreground">
            Carregando o editor de código…
          </p>
        }
      >
        <TabsContent value="files" forceMount className="flex data-[state=inactive]:hidden">
          <TemplateFilesPane files={draft.files} onFiles={(files) => onEdit({ files })} />
        </TabsContent>
        <TabsContent value="manifest" forceMount className="data-[state=inactive]:hidden">
          <CodeEditor
            value={draft.manifest}
            language="javascript"
            label="Manifesto do modelo"
            onChange={(manifest) => onEdit({ manifest })}
          />
          <ManifestProblem text={draft.manifest} />
          <SheetTemplateAssetsPanel
            manifest={draft.manifest}
            onManifest={(manifest) => onEdit({ manifest })}
            ports={assetPorts}
          />
        </TabsContent>
      </Suspense>
    </Tabs>
  );
}

type TemplateFilesPaneProps = Readonly<{
  files: readonly TemplateFile[];
  onFiles: (files: readonly TemplateFile[]) => void;
}>;

// The picked file falls back to the entry page when it is gone (renamed, removed, or another
// version loaded).
function TemplateFilesPane({ files, onFiles }: TemplateFilesPaneProps): React.JSX.Element {
  const [picked, setPicked] = useState(SHEET_TEMPLATE_ENTRY_PATH);
  const selected = files.some(({ path }) => path === picked) ? picked : SHEET_TEMPLATE_ENTRY_PATH;
  return (
    <>
      <SheetFileTree files={files} selected={selected} onSelect={setPicked} onChange={onFiles} />
      <div className="min-w-0 flex-1">
        {files.map((file) => {
          const kind = sheetTemplateFileKindOf(file.path);
          return (
            <div key={file.path} hidden={file.path !== selected}>
              <CodeEditor
                value={file.content}
                language={LANGUAGE_OF_KIND[kind]}
                label={`Arquivo ${file.path}`}
                onChange={(text) => onFiles(editTemplateFile(files, file.path, text))}
                completions={kind === 'js' ? SDK_COMPLETIONS : undefined}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}

function ManifestProblem({ text }: Readonly<{ text: string }>): React.JSX.Element | null {
  const reading = readSheetManifestText(text);
  if (reading.ok) return null;
  return (
    <p role="alert" className="border-t border-border px-4 py-2 text-sm text-destructive-text">
      {sheetManifestProblemMessage(reading.problem)}
    </p>
  );
}
