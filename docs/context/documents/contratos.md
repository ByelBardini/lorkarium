# Contratos de documentos

Fontes: `packages/contracts/src/documents/`, exportadas por `@lorkarium/contracts`. Apenas Zod, sem dependência de Tiptap.

## Conteúdo

`DocumentContentDto` é a árvore `{ type: 'doc', content: DocumentNodeDto[] }`; `schemaVersion: 1` pertence ao `DocumentDto`, fora da árvore. `EMPTY_DOCUMENT_CONTENT` contém um parágrafo vazio.

Nós: parágrafo, texto, quebra de linha, H1–H3, listas simples e itens, citação, separador, imagem, tabela, linha, célula e cabeçalho. O contrato verifica filhos válidos, exige parágrafo inicial de item de lista e recusa tabelas aninhadas e células mescladas. Tabelas têm até 100 linhas e 20 colunas.

Marcas: bold, italic, underline, strike, link e textStyle. Fontes (`DOCUMENT_FONTS`, tipo `DocumentFont`): Hanken Grotesk, Cormorant Garamond e JetBrains Mono (empacotadas) e as do Windows — Arial, Arial Black, Calibri, Cambria, Comic Sans MS, Consolas, Courier New, Garamond, Georgia, Impact, Palatino Linotype, Segoe UI, Tahoma, Times New Roman, Trebuchet MS, Verdana, Symbol, Webdings e Wingdings. Tamanho é string CSS de `8px` a `72px` (`DOCUMENT_FONT_SIZE_MIN`/`MAX`); cor RGB hexadecimal de seis dígitos. Parágrafos/títulos aceitam `textAlign`, `indent` inteiro 0–6 e `lineHeight` numérico 1, 1.15, 1.5 ou 2. Imagem usa `assetId`, `alt?`, `align?` e largura inteira 32–4096; `src` arbitrário é recusado.

Links são aparados e aceitam http, https e mailto; credenciais e esquemas executáveis são recusados. A abertura usa `_blank` e `noopener noreferrer`. Campos extras são recusados em nós, marcas e atributos.

Orçamento: 512 KiB JSON UTF-8, 100000 caracteres de texto, 10000 nós, profundidade 16 (raiz é 1), 50 ocorrências de imagem. Uma travessia iterativa verifica estrutura e profundidade antes de serializar ou clonar recursivamente a árvore. O resultado normaliza links e não mantém referências à entrada.

## Comandos e respostas

- `createDocumentRequestDto`: `actionId`, `name?` aparado 1–60, `folderId?` (nullable).
- `updateDocumentContentRequestDto`: `actionId`, `expectedVersion`, `name?`, `content?`; ao menos uma alteração e sem campos administrativos.
- `updateDocumentRequestDto`: `actionId`, `expectedVersion`, `folderId?`, `visibility?`, `ownerIds?`; ao menos uma alteração, donos sem repetição. Array vazio remove donos; pasta nula move à raiz.
- `deleteDocumentRequestDto`: `actionId`, `expectedVersion` inteiro não negativo.
- `documentParamsDto`: `campaignId`, `documentId` UUID.
- `importDocumentImageRequestDto`: `url` com a regra já existente de importação de assets.
- `documentImageFromLibraryRequestDto`: `imageId` UUID; resposta de imagem é `assetResponseDto`.

`DocumentSummaryDto`: id, name, folderId, visibility, version, updatedAt, canEdit, canManage e ownerIds opcional (só mestre). `DocumentDto` acrescenta schemaVersion e content. `documentResponseDto` envolve em `{document}`; escrita envolve `{document, receipt}`. Recibo leva actionId, documentId, version e operation (`create`, `content`, `update`, `delete`), sem corpo.

`campaignLibraryDto` acrescenta `documents` obrigatório ao agregado de imagens e grids. O contrato legado `libraryDto` de `/scenes` permanece estrito e separado.

## Provas

`packages/contracts/test/documents/`: 29 cenários, incluindo limites exatos e excesso de uma unidade, links, estrutura, estilos e comandos vazios. A inversão do limite de bytes e da guarda de links fez cinco cenários falharem por asserção; mutações removidas. A suíte inteira de contracts passou (865 testes). Driver `/testar` sem achados de aviso/erro.
