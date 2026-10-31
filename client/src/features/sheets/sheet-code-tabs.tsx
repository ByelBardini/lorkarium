import { lazy, Suspense } from 'react';
import type { CodeLanguage } from '@/code-editor/code-editor-setup';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { TemplateDraft } from '@/stores/sheet-template-draft-store';

const CodeEditor = lazy(() => import('@/code-editor/code-editor'));

type SourceKey = 'html' | 'css' | 'js';
type CodeTab = Readonly<{ key: SourceKey; title: string; language: CodeLanguage }>;

const CODE_TABS: readonly CodeTab[] = [
  { key: 'html', title: 'HTML', language: 'html' },
  { key: 'css', title: 'CSS', language: 'css' },
  { key: 'js', title: 'JS', language: 'javascript' },
];

/** The editor's tabs (code and preview): the active one is a lighter surface over the gold
 *  underline, so it reads at a glance against the dark code. */
export const EDITOR_TAB_CLASS =
  'h-9 rounded-none px-3 font-mono text-xs tracking-wide hover:bg-muted/60 data-[state=active]:bg-card data-[state=active]:text-primary';

export type SheetCodeTabsProps = Readonly<{
  draft: TemplateDraft;
  onEdit: (changes: Partial<TemplateDraft>) => void;
}>;

/** HTML, CSS and JS of a template, one tab each. The three editors stay mounted (hidden when
 *  not shown), so switching keeps each text and its undo history.
 *
 *  Example: `<SheetCodeTabs draft={model.draft} onEdit={model.edit} />` */
export function SheetCodeTabs({ draft, onEdit }: SheetCodeTabsProps): React.JSX.Element {
  return (
    <Tabs defaultValue="html" className="min-h-0 flex-1">
      <TabsList aria-label="Código do modelo" className="gap-0 bg-panel px-2">
        {CODE_TABS.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key} className={EDITOR_TAB_CLASS}>
            {tab.title}
          </TabsTrigger>
        ))}
      </TabsList>
      <Suspense
        fallback={
          <p role="status" className="p-4 text-sm text-muted-foreground">
            Carregando o editor de código…
          </p>
        }
      >
        {CODE_TABS.map((tab) => (
          <TabsContent
            key={tab.key}
            value={tab.key}
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <CodeEditor
              value={draft[tab.key]}
              language={tab.language}
              label={`${tab.title} do modelo`}
              onChange={(text) => onEdit({ [tab.key]: text })}
            />
          </TabsContent>
        ))}
      </Suspense>
    </Tabs>
  );
}
