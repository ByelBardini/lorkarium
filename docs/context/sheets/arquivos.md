# Fichas — modelo em arquivos e assets do modelo

Hub: [`../sheets.md`](../sheets.md). O modelo é uma lista ordenada de arquivos (`files`), com fontes e imagens próprias (assets do modelo) declaradas no manifesto. Contratos gerais em [`contratos.md`](contratos.md); servidor em [`server.md`](server.md); `srcdoc` em [`sandbox.md`](sandbox.md).

## Contrato dos arquivos (`packages/contracts/src/sheets/sheet-template-files.dto.ts`)

- `sheetTemplateFilesDto`: `[{ path, content }]` (cada um estrito), 1 a `SHEET_TEMPLATE_FILES_MAX` (64), com `index.html` (`SHEET_TEMPLATE_ENTRY_PATH`), caminhos distintos **sem caixa** e a soma UTF-8 até `SHEET_TEMPLATE_SOURCE_MAX_BYTES` (512 KiB). A ordem é a ordem em que o CSS e o JS rodam.
- `sheetTemplateFilePathDto` (`isPlainTemplatePath`): segmentos `[A-Za-z0-9_-][A-Za-z0-9_.-]*` unidos por `/`, até 120 caracteres, terminando em `.html`, `.css` ou `.js` (minúsculo). Recusa `..`, `/` inicial, `\`, espaço, acento e extensão fora da lista, citando o caminho.
- Mensagens: `files have N bytes; expected at most 524288`, `files have no index.html; …`, `file paths "Estilo.css" and "estilo.css" repeat; …`, `files has 65; expected at most 64`.
- `sheetTemplateFileKindOf(path)` → `html` | `css` | `js` (outra extensão → `RangeError`); `checkRepeatedPaths` é reaproveitado pelos assets do `.lksheet`.
- `sheetTemplateDto`/`sheetTemplateCodeDto`/`createSheetTemplateRequestDto` levam `files` (obrigatório); `updateSheetTemplateRequestDto` leva `files?` **inteiro** (outra ordem já é mudança). `html`/`css`/`js` são recusados pelo estrito.

## Assets do modelo (`sheet-template-asset.dto.ts`)

- `SHEET_TEMPLATE_ASSET_MIME_TYPES`: PNG, JPEG, WebP e `font/woff2`. `SHEET_TEMPLATE_FONT_MAX_BYTES` (2 MiB), `SHEET_TEMPLATE_ASSETS_MAX_BYTES` (8 MiB somando os assets do modelo, cada id uma vez) e `SHEET_TEMPLATE_ASSETS_MAX` (32).
- Manifesto: `assets: [{ path, assetId }]` (`sheetManifestAssetDto`, padrão `[]`, até 32, caminho distinto sem caixa: `asset path "X" repeats; …`). `sheetTemplateAssetPathDto`: o mesmo segmento dos arquivos, terminando em `.woff2`, `.png`, `.jpg`, `.jpeg` ou `.webp`.
- `sheetTemplateAssetDto` `{ id, mimeType, sizeBytes }` (sem pixels: fonte não tem) e `sheetTemplateAssetResponseDto` `{ asset }`.
- No `.lksheet`: `sheetTemplateFileAssetDto` `{ path, type, data }` (base64 padrão), lista `assets` (padrão `[]`, até 32, caminhos distintos, soma decodificada até 8 MiB: `assets have N bytes; …`).

## Servidor

- Coluna `sheet_templates.files` (JSONB `NOT NULL`, tipada por `SheetTemplateFilesPo`) da `0099_sheet_template_files`, gerada em dois passos e juntada à mão: `ADD COLUMN` nula → `UPDATE` com `jsonb_build_array` de `index.html`/`style.css`/`script.js` a partir de `html`/`css`/`js` → `SET NOT NULL` → `DROP` das três. Provada por `sheet-templates-migration.spec.ts` (mesmo texto e versão, modelo vazio, colunas removidas, insert sem `files` recusado).
- `0100_sheet_template_assets`: `ALTER TYPE asset_purpose ADD VALUE 'sheet_template_asset'` e `asset_mime_type ADD VALUE 'font/woff2'`. Fonte guardada como veio (`toNewFontAssetPo`, 0 × 0 px).
- `POST /api/campaigns/:c/sheet-template-assets` (`sheet-template-assets.routes.ts`, plugin `createSheetTemplateAssetsModule`): corpo cru dos quatro tipos, `bodyLimit` 8 MiB, sessão + mestre no **`onRequest`** (403 antes de ler o corpo), 20 por minuto no `preParsing`. 201 `sheetTemplateAssetResponseDto`; 413 `ASSET_TOO_LARGE`; 415 outro tipo; 422 `UNSUPPORTED_IMAGE`/`UNSUPPORTED_FONT`; 429.
- `AssetsService.uploadSheetTemplateAsset`: mestre (`requireMaster`) → fonte: `requireSize` 2 MiB + `requireWoff2` (assinatura `77 4f 46 32`; TTF, OTF ou WOFF 1 renomeado → `UNSUPPORTED_FONT` citando os 4 primeiros bytes) → S3 → linha; imagem: processador (4096 px, sem GIF) → S3 → linha. A rota genérica recusa a finalidade (`dedicatedEndpointOf`) e ela é mestre-só e protegida (`private, no-cache`).
- Salvar o modelo com manifesto (`create`/`update`, sob a trava da mesa): `SheetTemplateAssetBo.requireDeclared` confere pelo `AssetsDao.findManyInCampaign` que cada `assetId` é `sheet_template_asset` **desta** mesa (senão 404 `SHEET_TEMPLATE_ASSET_NOT_FOUND` citando o caminho) e que a soma cabe em 8 MiB (413 `SHEET_TEMPLATE_ASSETS_TOO_LARGE`).
- Leitura (`SheetTemplateAssetReadPolicy`, composta no `readPolicy` do `buildApp` por `purpose`): o mestre da mesa lê qualquer asset do modelo (mesmo de modelo excluído); os outros só se leem (`canRead`) alguma ficha cujo modelo o declara (`SheetTemplatesDao.sheetIdsUsingAsset`: `manifest -> 'assets' @> [{"assetId"}]`). Excluir o modelo não apaga o asset.

## Montagem no client (`client/src/sheet-sandbox/sheet-page-assembly.ts`)

- `expandSheetPage(files)`: troca cada `<lk-include src="p.html"></lk-include>` (ou `<lk-include src='p.html' />`) pelo arquivo `.html`, recursivo até `SHEET_INCLUDE_MAX_DEPTH` (8) níveis abaixo do `index.html`. Recusa por `SheetBuildError` (`problem`, `path`, `file`, `line`): `no_entry`, `missing_include` (inexistente ou não `.html`), `include_cycle` (`a.html → b.html → a.html`), `include_too_deep`.
- `inlineSheetAssets(text, file, assets)`: `url(asset:…)` (com ou sem aspas) no CSS e no HTML e atributo `="asset:…"` no HTML viram `data:<tipo>;base64,…`; caminho fora do mapa → `missing_asset`. Texto solto "asset:x" não muda. O JS não é tocado.
- `sheetBuildErrorText` diz o problema em pt-BR com arquivo e linha; o `SheetSourceFrame` mostra "A ficha não pôde ser montada: …" no lugar do frame (nenhuma porta abre).
- Os bytes: `useSheetAssetData(reader, manifest.assets)` (`features/sheets/use-sheet-asset-data.ts`) lê cada id uma vez por leitor (`SheetTemplatesApi.asset`, tipo conferido por `sheetTemplateAssetMimeTypeDto`, até 8 MiB), em base64 (`lib/base64.ts`), e devolve o mesmo `Map` enquanto a lista não muda (o frame não é refeito por render). Na sala (`SheetPanel`, `services.templateAssets`) o frame espera ("Carregando as fontes e imagens da ficha…"); asset ilegível → alerta com o caminho. Na prévia, a lista sai do manifesto digitado.

## Armadilhas

- **Gerar a migração de troca de colunas pede confirmação interativa** (o drizzle-kit pergunta se `files` é um `html` renomeado e falha sem TTY): gerar em dois passos (com as colunas velhas e a nova, depois sem as velhas) e juntar o SQL e os snapshots numa migração só.
- **O manifesto guardado antes dos assets não tem a lista:** o PO tipa `assets?` e o mapper relê pelo contrato (vem `[]`). No editor, o texto do manifesto só mostra `assets` quando há algum (o texto de um manifesto antigo não muda).
- **O `asset:` do CSS é trocado antes do `inertStyle`:** a linha do erro não muda (base64 não tem quebra), por isso o layout das linhas é medido sem os assets.
