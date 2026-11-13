# Client · fichas: arquivo `.lksheet` (exportar e importar modelo)

Índice: [`sheets.md`](sheets.md). Editor: [`sheet-template-editor.md`](sheet-template-editor.md). Biblioteca: [`library.md`](library.md). Contrato do arquivo: [`../sheets/contratos.md`](../sheets/contratos.md) (Arquivo do modelo).

Só o mestre (o jogador nem vê modelos). Nada novo no servidor: exportar é um `GET …/sheet-templates/:t`, importar é o `POST …/sheet-templates` de sempre, e o arquivo cru nunca sai do client.

## Arquivo (`src/lib/sheet-template-file.ts`, sem DOM)

- `sheetTemplateFileText(template, exportedAt = new Date())`: JSON indentado, formato 2, com `format`, `formatVersion`, `exportedAt`, `name`, `files`, `manifest` (com `assets: []`: os ids são desta mesa) e `assets` (`{ path, type, data }` em base64, só quando há) (`SheetTemplateFileContent`, `assets?`). Nunca id, versão, pasta ou fichas.
- `readSheetTemplateFile(text)` → `{ ok: true, template } | { ok: false, problem }`. Tira o BOM, e então: `JSON.parse` falhou → `not_json`; cabeçalho (`sheetTemplateFileHeaderDto`) falhou → `not_lksheet`; `formatVersion` maior que 2 → `newer_version`; formato 1 → `sheetTemplateFileV1Dto` e os três arquivos `index.html`/`style.css`/`script.js` (`filesOfLegacySource`, os nomes da migração do servidor); corpo estrito falhou pelo orçamento (mensagem "have N bytes" do código ou dos assets, ou `too_big` numa fonte) → `over_budget`; o resto → `invalid` (manifesto recusado incluído: o refine dele tem caminho).
- `sheetTemplateFileName(name)`: `<>:"/\|?*` e os de controle viram `-`, mais `.lksheet`; só traços ou vazio → `modelo-de-ficha.lksheet`.
- `sheetTemplateFileTooLarge(size)`: acima de `SHEET_TEMPLATE_FILE_MAX_BYTES` (12 MiB) o arquivo é recusado **sem ler** (`over_budget`).
- Textos: `sheetTemplateFileProblemMessage(problem)` em `src/features/sheets/sheet-template-messages.ts` ("Este arquivo não é um modelo de ficha (.lksheet).", "Este arquivo foi feito numa versão mais nova do Lorkarium.", "O código do arquivo passa de 512 KiB, ou os assets de 8 MiB.", "…incompleto ou foi alterado.").

## Download (`src/services/file-download.ts`)

Porta `FileDownload` (`save(text, fileName, type?)`) com `BrowserFileDownload` sobre `downloadText` (`src/lib/download-text.ts`, que ganhou o `type` opcional; padrão `text/plain;charset=utf-8`). No `AppDependencies` como `fileDownload`, ligada no `main.tsx`; nos specs, `FileDownloadFake` (`saves`). Chega à biblioteca por `library-route.tsx` → `LibraryDrawer` → `LibraryBrowser` (`fileDownload?`), e ao editor da aba por `deps` em `workspace-sheet-template.tsx`.

## Exportar (`src/features/sheets/use-sheet-template-export.ts`)

- `exportSheetTemplate(ports, templateId)` lê **a versão salva** pelo `detail`, os bytes de cada asset do manifesto (`api.asset`, em base64; um ilegível para o export com a falha dele) e salva `sheetTemplateFileText` como `sheetTemplateFileName(nome)`, tipo `application/json`; devolve o `kind` da falha ou `null`. `useSheetTemplateExport(ports | undefined)` dá `exportTemplate`, `busy` e `problem` em palavras (`sheetTemplateFailureMessage`). Sem portas, não faz nada.
- **Árvore:** "Exportar modelo" no menu do modelo (`library-template-menu-items.tsx`, antes de "Excluir modelo"), desabilitado sem conexão; só existe com `sheetTemplatesApi` e `fileDownload`. A falha vai para a linha de status da biblioteca (`refusal ?? exportProblem`).
- **Editor:** botão "Exportar modelo" (`DownloadIcon`, `sheet-template-export-button.tsx`) no cabeçalho, pela prop `exportPorts` do `SheetTemplateEditor` (a biblioteca e a aba passam). Com código não salvo, o `aria-description`/`title` diz "Exporta a versão salva; salve antes para levar o que mudou", e o arquivo leva o código do servidor, não o digitado. Falha em `role="status"` ao lado.

## Importar (`src/features/library/`)

- Entradas: "Importar de um arquivo" no card "Modelo de ficha" do diálogo "Novo item" (na pasta de destino dele) e "Importar modelo…" no menu da raiz e no da pasta (`CreateItems`).
- `use-sheet-template-import.ts`: `choose(pasta)` guarda a pasta e clica o input; `readFile` recusa o grande demais sem ler, senão `readSheetTemplateFile`; recusa → `problem` (`role="alert"` na biblioteca, sem diálogo); aceito → `pending`. `confirm(nome)` envia antes cada asset do arquivo a esta mesa (`uploadAsset`, ligado pelo `use-sheet-template-files.ts`) e põe os ids novos no `manifest.assets` (o `assets` do arquivo nunca vai no `POST`); um asset recusado para tudo com a mensagem no diálogo (os já enviados ficam órfãos). Então espera o `importTemplate` (o intent `createSheetTemplate` de `use-sheet-template-create.ts`, que resolve depois de reler a biblioteca) e então lê o `refusal` da biblioteca: com recusa o diálogo fica aberto com ela; sem, fecha e o modelo novo é escolhido (o editor abre).
- `import-sheet-template-dialog.tsx`: `SheetTemplateImport` monta o input escondido (`sr-only`, `accept=".lksheet"`, `aria-label="Arquivo de modelo de ficha"`, valor zerado depois de cada escolha para o mesmo arquivo disparar de novo), o alerta e o diálogo "Importar modelo de ficha": "Nome do modelo" (editável; vazio desabilita "Importar"), "Tamanho do código" ("12,3 KiB de 512 KiB"), o aviso "O código foi escrito por outra pessoa e roda isolado, sem acesso à rede nem à sua conta.", o que o manifesto pede (lista "Permissões pedidas" em palavras pelo `sheetManifestPermissionLabel` (`sheet-manifest-messages.ts`) — "Gravar CA e CD do personagem", "Trocar o retrato", "Enviar imagens", "Ler os documentos públicos da mesa", "Criar barras no personagem" — ou "Nenhuma permissão além de valores, barras e dados."; "Barras esperadas: HP (até 12)" quando há barras), "Cancelar" e "Importar" (desabilitado sem conexão). "1 fonte ou imagem vai junto." / "N fontes e imagens vão junto." (`Assets do arquivo`) quando o arquivo as tem. O manifesto vai junto no `POST`.
- `use-sheet-template-files.ts` junta exportar e importar para o `LibraryBrowser` (`templateFiles` do modelo).

## Armadilhas

- **O React Compiler trata como ref tudo que passa por `ref=`:** o input recebe o `attachInput` (um `setState`) por um componente próprio (`SheetTemplateFileInput`); pôr `ref={importer.x}` direto marca o `importer` inteiro como ref e o lint recusa ler qualquer campo dele no render.
- **A recusa do servidor só existe depois do `submit`:** o `LibrarySubmit` resolve sem resultado; quem diz se deu certo é o `refusal` do render seguinte. Por isso o hook guarda `phase: 'sent'` e deriva `pending`/`sendError` do `refusal`, sem efeito.
