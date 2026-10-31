# Contratos de documentos

Fontes: `packages/contracts/src/documents/`, exportadas por `@lorkarium/contracts`. Apenas Zod, sem dependência de Tiptap.

## Conteúdo

`DocumentContentDto` é a árvore `{ type: 'doc', content: DocumentNodeDto[] }`, agora o conteúdo **de cada aba**; `schemaVersion: 1` pertence ao `DocumentTabDto`, fora da árvore. `EMPTY_DOCUMENT_CONTENT` contém um parágrafo vazio.

Nós: parágrafo, texto, quebra de linha, H1–H3, listas simples e itens, citação, separador, imagem, tabela, linha, célula e cabeçalho. O contrato verifica filhos válidos, exige parágrafo inicial de item de lista e recusa tabelas aninhadas e células mescladas. Tabelas têm até 100 linhas e 20 colunas.

Marcas: bold, italic, underline, strike, link e textStyle. Fontes (`DOCUMENT_FONTS`, tipo `DocumentFont`): Hanken Grotesk, Cormorant Garamond e JetBrains Mono (empacotadas) e as do Windows — Arial, Arial Black, Calibri, Cambria, Comic Sans MS, Consolas, Courier New, Garamond, Georgia, Impact, Palatino Linotype, Segoe UI, Tahoma, Times New Roman, Trebuchet MS, Verdana, Symbol, Webdings e Wingdings. Tamanho é string CSS de `8px` a `72px` (`DOCUMENT_FONT_SIZE_MIN`/`MAX`); cor RGB hexadecimal de seis dígitos. Parágrafos/títulos aceitam `textAlign`, `indent` inteiro 0–6 e `lineHeight` numérico 1, 1.15, 1.5 ou 2. Imagem usa `assetId`, `alt?`, `align?` e largura inteira 32–4096; `src` arbitrário é recusado.

Links são aparados e aceitam http, https e mailto; credenciais e esquemas executáveis são recusados. A abertura usa `_blank` e `noopener noreferrer`. Campos extras são recusados em nós, marcas e atributos.

Orçamento: 512 KiB JSON UTF-8, 100000 caracteres de texto, 10000 nós, profundidade 16 (raiz é 1), 50 ocorrências de imagem. Uma travessia iterativa verifica estrutura e profundidade antes de serializar ou clonar recursivamente a árvore. O resultado normaliza links e não mantém referências à entrada.

## Comandos e respostas

- `createDocumentRequestDto`: `actionId`, `name?` aparado 1–60, `folderId?` (nullable).
- `updateDocumentContentRequestDto`: `actionId`, `expectedVersion`, `name` obrigatório — só renomeia (o corpo vai por aba, `PATCH …/tabs/:tabId/content`); sem campos administrativos.
- `updateDocumentRequestDto`: `actionId`, `expectedVersion`, `folderId?`, `visibility?`, `ownerIds?`; ao menos uma alteração, donos sem repetição. Array vazio remove donos; pasta nula move à raiz.
- `deleteDocumentRequestDto`: `actionId`, `expectedVersion` inteiro não negativo.
- `documentParamsDto`: `campaignId`, `documentId` UUID.
- `importDocumentImageRequestDto`: `url` com a regra já existente de importação de assets.
- `documentImageFromLibraryRequestDto`: `imageId` UUID; resposta de imagem é `assetResponseDto`.

`DocumentSummaryDto`: id, name, folderId, visibility, version, updatedAt, canEdit, canManage e ownerIds opcional (só mestre). `DocumentDto` acrescenta `schemaVersion: 2` e `tabs: DocumentTabSummaryDto[]` (obrigatório), sem corpo: o conteúdo vem por aba. `documentResponseDto` envolve em `{document}`; escrita envolve `{document, receipt}`. Recibo leva actionId, documentId, `tabId?`, version e operation (`create`, `content`, `update`, `delete`, `tab-create`, `tab-update`, `tab-reorder`, `tab-delete`, `tab-content`), sem corpo.

`documentVersionDto` (inteiro não negativo) e `versionedActionShape` (`actionId` + `expectedVersion`) moram em `document-version.dto.ts`, compartilhados por `document.dto.ts` e `document-tab.dto.ts` sem um importar o outro em ciclo.

## Abas

Fonte: `document-tab.dto.ts`. Teto `DOCUMENT_TABS_MAX` = 200 abas por documento; nome aparado 1–40 (`DOCUMENT_TAB_NAME_MAX_LENGTH`), padrão `UNNAMED_DOCUMENT_TAB_NAME` ("Nova aba").

- `documentTabVisibilityDto`: `document` (segue o documento) ou `masters` (só mestres).
- `documentTabSummaryDto`: id, name, visibility, version (da aba), updatedAt. `documentTabDto` acrescenta `schemaVersion: 1` e `content`; leitura de aba é `documentTabResponseDto` `{ tab }`.
- `documentTabParamsDto`: `campaignId`, `documentId`, `tabId` UUID.
- Comandos com `versionedActionShape` (versão **do documento**): `createDocumentTabRequestDto` (`name?`), `updateDocumentTabRequestDto` (`name?`, `visibility?`; ao menos um), `reorderDocumentTabsRequestDto` (`tabIds` 1–200, sem repetição: "Expected unique document tab IDs"), `deleteDocumentTabRequestDto`.
- `updateDocumentTabContentRequestDto`: `actionId`, `expectedVersion` **da aba** e `content` obrigatório; editar uma aba não conflita com outra.
- Respostas: estruturais (criar, PATCH, reordenar, excluir aba) → `documentWriteResponseDto` `{ document, receipt }` (id da aba criada em `receipt.tabId`); corpo → `documentTabWriteResponseDto` `{ tab: DocumentTabSummaryDto, receipt }` (versão da aba); leitura → `documentTabResponseDto` `{ tab }`. Rotas e erros: [abas.md](abas.md).

`campaignLibraryDto` acrescenta `documents` obrigatório ao agregado de imagens e grids. O contrato legado `libraryDto` de `/scenes` permanece estrito e separado.

## Provas

`packages/contracts/test/documents/`: 29 cenários do documento e 10 das abas (`document-tab.dto.spec.ts`: nome aparado e 40/41, reordenar 200/201 e id repetido, patch vazio, `secret` recusado, documento sem `tabs` ou em `schemaVersion: 1` recusado, recibo com `tabId`), incluindo limites exatos e excesso de uma unidade, links, estrutura, estilos e comandos vazios. A inversão do limite de bytes e da guarda de links fez cinco cenários falharem por asserção; mutações removidas. Nas abas, oito mutações (limites 40/200, unicidade, patch vazio, visibilidade, `tabs` opcional, operação extra, `content` opcional) deixaram o cenário certo vermelho; desfeitas. A suíte inteira de contracts passou (878 testes). Driver `/testar` sem achados de aviso/erro.
