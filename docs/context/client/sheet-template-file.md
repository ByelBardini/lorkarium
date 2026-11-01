# Client · fichas: arquivo `.lksheet` (exportar e importar modelo)

Índice: [`sheets.md`](sheets.md). Editor: [`sheet-template-editor.md`](sheet-template-editor.md). Biblioteca: [`library.md`](library.md). Contrato do arquivo: [`../sheets/contratos.md`](../sheets/contratos.md) (Arquivo do modelo). Plano: [`exportar-importar-modelo-de-ficha`](../../plans/2026-10-31-exportar-importar-modelo-de-ficha.md).

Só o mestre (o jogador nem vê modelos). Nada novo no servidor: exportar é um `GET …/sheet-templates/:t`, importar é o `POST …/sheet-templates` de sempre, e o arquivo cru nunca sai do client.

## Arquivo (`src/lib/sheet-template-file.ts`, sem DOM)

- `sheetTemplateFileText(template, exportedAt = new Date())`: JSON indentado com `format`, `formatVersion`, `exportedAt`, `name`, `html`, `css` e `js` (`SheetTemplateFileContent`). Nunca id, versão, pasta ou fichas.
- `readSheetTemplateFile(text)` → `{ ok: true, template } | { ok: false, problem }`. Tira o BOM, e então: `JSON.parse` falhou → `not_json`; cabeçalho (`sheetTemplateFileHeaderDto`) falhou → `not_lksheet`; `formatVersion` maior que 1 → `newer_version`; corpo estrito falhou pelo orçamento (refine `custom` ou `too_big` numa fonte) → `over_budget`; o resto → `invalid`.
- `sheetTemplateFileName(name)`: `<>:"/\|?*` e os de controle viram `-`, mais `.lksheet`; só traços ou vazio → `modelo-de-ficha.lksheet`.
- `sheetTemplateFileTooLarge(size)`: acima de `SHEET_TEMPLATE_FILE_MAX_BYTES` (2 MiB) o arquivo é recusado **sem ler** (`over_budget`).
- Textos: `sheetTemplateFileProblemMessage(problem)` em `src/features/sheets/sheet-template-messages.ts` ("Este arquivo não é um modelo de ficha (.lksheet).", "Este arquivo foi feito numa versão mais nova do Lorkarium.", "O código do arquivo passa de 512 KiB.", "…incompleto ou foi alterado.").

## Download (`src/services/file-download.ts`)

Porta `FileDownload` (`save(text, fileName, type?)`) com `BrowserFileDownload` sobre `downloadText` (`src/lib/download-text.ts`, que ganhou o `type` opcional; padrão `text/plain;charset=utf-8`). No `AppDependencies` como `fileDownload`, ligada no `main.tsx`; nos specs, `FileDownloadFake` (`saves`). Chega à biblioteca por `library-route.tsx` → `LibraryDialog` → `LibraryBrowser` (`fileDownload?`), e ao editor da aba por `deps` em `workspace-sheet-template.tsx`.

## Exportar (`src/features/sheets/use-sheet-template-export.ts`)

- `exportSheetTemplate(ports, templateId)` lê **a versão salva** pelo `detail` e salva `sheetTemplateFileText` como `sheetTemplateFileName(nome)`, tipo `application/json`; devolve o `kind` da falha ou `null`. `useSheetTemplateExport(ports | undefined)` dá `exportTemplate`, `busy` e `problem` em palavras (`sheetTemplateFailureMessage`). Sem portas, não faz nada.
- **Árvore:** "Exportar modelo" no menu do modelo (`library-template-menu-items.tsx`, antes de "Excluir modelo"), desabilitado sem conexão; só existe com `sheetTemplatesApi` e `fileDownload`. A falha vai para a linha de status da biblioteca (`refusal ?? exportProblem`).
- **Editor:** botão "Exportar modelo" (`DownloadIcon`, `sheet-template-export-button.tsx`) no cabeçalho, pela prop `exportPorts` do `SheetTemplateEditor` (a biblioteca e a aba passam). Com código não salvo, o `aria-description`/`title` diz "Exporta a versão salva; salve antes para levar o que mudou", e o arquivo leva o código do servidor, não o digitado. Falha em `role="status"` ao lado.

## Importar (`src/features/library/`)

- Entradas: "Criar item" → "Importar modelo de ficha" (raiz); no menu da raiz "Importar modelo de ficha" e no da pasta "Importar modelo aqui" (`ImportTemplateItem`).
- `use-sheet-template-import.ts`: `choose(pasta)` guarda a pasta e clica o input; `readFile` recusa o grande demais sem ler, senão `readSheetTemplateFile`; recusa → `problem` (`role="alert"` na biblioteca, sem diálogo); aceito → `pending`. `confirm(nome)` espera o `importTemplate` (o intent `createSheetTemplate` de `use-sheet-template-create.ts`, que resolve depois de reler a biblioteca) e então lê o `refusal` da biblioteca: com recusa o diálogo fica aberto com ela; sem, fecha e o modelo novo é escolhido (o editor abre).
- `import-sheet-template-dialog.tsx`: `SheetTemplateImport` monta o input escondido (`sr-only`, `accept=".lksheet"`, `aria-label="Arquivo de modelo de ficha"`, valor zerado depois de cada escolha para o mesmo arquivo disparar de novo), o alerta e o diálogo "Importar modelo de ficha": "Nome do modelo" (editável; vazio desabilita "Importar"), "Tamanho do código" ("12,3 KiB de 512 KiB"), o aviso "O código foi escrito por outra pessoa e roda isolado, sem acesso à rede nem à sua conta.", "Cancelar" e "Importar" (desabilitado sem conexão).
- `use-sheet-template-files.ts` junta exportar e importar para o `LibraryBrowser` (`templateFiles` do modelo).

## Armadilhas

- **O React Compiler trata como ref tudo que passa por `ref=`:** o input recebe o `attachInput` (um `setState`) por um componente próprio (`SheetTemplateFileInput`); pôr `ref={importer.x}` direto marca o `importer` inteiro como ref e o lint recusa ler qualquer campo dele no render.
- **A recusa do servidor só existe depois do `submit`:** o `LibrarySubmit` resolve sem resultado; quem diz se deu certo é o `refusal` do render seguinte. Por isso o hook guarda `phase: 'sent'` e deriva `pending`/`sendError` do `refusal`, sem efeito.
