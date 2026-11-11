# Fichas · leitura de documentos

A ficha lê os documentos da mesa pelo SDK: a lista, as abas de um documento e o conteúdo de uma aba. Só leitura e sob demanda (nada é empurrado quando um documento muda: a ficha relê). Hub: [`../sheets.md`](../sheets.md); documentos em [`../documents.md`](../documents.md).

## Regras

- **Só o público, igual para todos:** entra o documento `public` fora de pasta `private` (a pasta oculta esconde o que tem dentro, subpastas também) e só as abas `document`. Documento oculto, numa pasta oculta ou numa pasta que o leitor nem recebeu → `DOCUMENT_NOT_FOUND`; aba `masters` ou inexistente → `DOCUMENT_TAB_NOT_FOUND`. **Vale para o mestre e para o jogador dono de um documento oculto:** a ficha nunca mostra a um leitor o que outro não veria.
- **Permissão `documents:read`** no manifesto (`SHEET_MANIFEST_PERMISSIONS`; rótulo "Ler os documentos públicos da mesa"). Sem ela → `PERMISSION_NOT_DECLARED` sem nenhuma leitura. Não pede `canEdit`: quem só lê a ficha também lê os documentos.
- **Sem mudança no server:** o host lê com a sessão de quem olha (`LibraryApi.list` e `DocumentsApi.detail`/`tab`) e só **estreita** o que o leitor já pode ler; o server reautoriza cada leitura. O filtro vem da biblioteca, nunca só do detalhe (o detalhe do mestre responderia um oculto).
- **Limite:** `SHEET_DOCUMENT_READ_RATE` (60 em 60 s, as três somadas, na sala e na prévia). A recusa por limite não conta.
- Imagem dentro da aba: a árvore traz o `assetId`; os bytes vêm pelo `assets.read` (que pede `sheet:images`).

## Contrato (`packages/contracts/src/sheets/`)

- Pedidos no `sheetFrameMessageDto` (`sheet-bridge.dto.ts`): `documents.list` (só `requestId`), `documents.tabs` (`documentId` uuid) e `documents.readTab` (`documentId`, `tabId` uuid). Sem `campaignId`: o host sabe a mesa.
- Respostas em `sheet-bridge-documents.dto.ts`, cada uma sob a sua chave no `sheetBridgeResultValueDto`: `{ documents: sheetFrameDocumentDto[] }` (`id`, `name`, `folderPath` = nomes das pastas da raiz, até `SCENE_FOLDER_DEPTH_MAX`; sem visibilidade), `{ tabs: sheetFrameDocumentTabDto[] }` (`id`, `name`, até `DOCUMENT_TABS_MAX`) e `{ tab: sheetFrameDocumentTabContentDto }` (`id`, `name`, `content` revalidado pelo `documentContentDto`, `text`).

## Client

- `src/lib/document-plain-text.ts` — `documentPlainText(content)`: um parágrafo ou título por linha (parágrafo vazio = linha vazia), `hardBreak` = quebra, listas e citação pelos parágrafos, linha de tabela por linha com as células separadas por `\t`, imagem e régua não dão nada.
- `src/sheet-sandbox/sheet-bridge-documents.ts` — `SheetDocumentSources` (`{ library, documents }`), `isSheetDocumentRead`, `readSheetDocuments(fontes, campaignId, pedido)` e `publicDocumentsOf(biblioteca)`. `tabs`/`readTab` conferem a biblioteca antes (documento fora dela → `DOCUMENT_NOT_FOUND` **sem** abrir o detalhe nem a aba); a aba vem do `tab` e passa pela visibilidade dela. Falha de rede → o `kind` em maiúsculas (`OFFLINE`).
- Host da sala: `createSheetBridgeHost({ …, documents })`, ligado no `SheetPanelServices.documents` (o `WorkspaceSheet` passa `libraryApi` e `documentsApi` do `AppDependencies`). Ordem: manifesto → limite → leitura, antes da guarda de `canEdit`.
- Prévia do editor: `createSheetPreviewHost(port, { documents: { sources, campaignId } })` (`SheetPreviewDocumentPorts`) lê os documentos **reais** (ler não muda nada), com o mesmo manifesto e limite; sem `documents` → `PREVIEW_ONLY`; resposta depois do `dispose` não sai. Vem por `documentPorts` de `SheetTemplateEditor` → `SheetTemplateWorkbench` → `SheetTemplatePreview`: na aba/janela pelo `WorkspaceSheetTemplate`, na biblioteca pelo `LibrarySheetTemplateEditor.documentSources` (o `LibraryItemPanel` recebe `libraryApi` do `LibraryBrowser`).
- SDK (`sheet-bridge-bootstrap.ts`): `lorkarium.documents.list()` → a lista, `.tabs(documentId)` → as abas, `.readTab(documentId, tabId)` → a aba; o `result` chega **desembrulhado** e como cópia JSON própria (`documentValueOf`). Tipos em `sheet-sdk-shapes.ts` (`SheetFrameDocument`, `SheetFrameDocumentTab`, `SheetFrameDocumentTabContent`).
- Referência e autocompletar: `DOCUMENT_SDK_CALLS` (`src/features/sheets/sheet-api-reference-documents.ts`), somado ao `SDK_CALLS` (o autocompletar sai dele: `lorkarium.documents.` → `list`, `tabs`, `readTab`); a tabela de erros mora em `sheet-api-reference-errors.ts` (reexportada pelo `sheet-api-reference-content.ts`) com `DOCUMENT_NOT_FOUND` e `DOCUMENT_TAB_NOT_FOUND`; o limite está em "Limites da ficha".

## Testes

`packages/contracts/test/sheets/sheet-bridge-documents.dto.spec.ts` (pedidos, ids, `campaignId` recusado, visibilidade recusada no resultado, pasta funda, 201 abas, árvore inválida); `client/test/lib/document-plain-text.spec.ts`; `client/test/sheet-sandbox/sheet-bridge-host-documents.spec.ts` (só Bestiário entre privado, pasta oculta e pasta não recebida; caminho da pasta; sem permissão nada lido; leitor sem `canEdit`; `OFFLINE`; 61ª → `RATE_LIMITED`; abas sem `masters`; documento fora → sem detalhe; aba `masters` e inexistente; aba de documento privado sem leitura), `sheet-preview-host-documents.spec.ts` (mesa real, manifesto, sem mesa, limite, `dispose`) e `sheet-bridge-bootstrap-documents.spec.ts`; `sheet-api-reference.spec.tsx` e `sheet-sdk-completions.spec.ts`. O `noDocuments()` do `sheet-bridge-harness.ts` serve o host de spec que não lê documento; `summaryOfDocument` em `documents-fixtures.ts`. Mutações desfeitas: sem o filtro da pasta (2 vermelhos) e sem o filtro da aba `document` (1 vermelho).
