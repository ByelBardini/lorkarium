# Contratos das fichas

Fontes: `packages/contracts/src/sheets/`, exportadas por `@lorkarium/contracts`. Só Zod. O byte UTF-8 é contado por `utf8Length` (`packages/contracts/src/utf8-length.ts`), porque o contracts compila sem a lib DOM e não tem `TextEncoder` tipado.

## Modelo (`sheet-template.dto.ts`)

- Limites: `SHEET_TEMPLATE_SOURCE_MAX_BYTES` (512 KiB, a soma de html + css + js em UTF-8), `SHEET_TEMPLATE_NAME_MAX_LENGTH` (60; nome aparado, 1–60) e `UNNAMED_SHEET_TEMPLATE_NAME` ("Modelo sem nome"). Cada fonte tem um teto barato de 512 Ki caracteres antes da contagem de bytes.
- `sheetTemplateSummaryDto`: `id`, `folderId` (nulo = raiz), `name`, `version`, `updatedAt`, **sem código**. É a linha do agregado da biblioteca do mestre (o `campaignLibraryDto` ainda não o leva).
- `sheetTemplateDto`: o resumo mais `html`, `css` e `js`, dentro do orçamento. É o que o editor do mestre lê.
- `sheetTemplateCodeDto`: `name`, `version`, `html`, `css` e `js`. É o código que a ficha roda e vai junto da leitura da ficha. O `name` monta o rótulo do dado ("Ficha Tormenta · Ataque").
- `createSheetTemplateRequestDto`: `name?`, `folderId?` (nullable), `html`, `css` e `js` obrigatórios. Sem `actionId`, como os grids e pastas da biblioteca.
- `updateSheetTemplateRequestDto`: `expectedVersion` (conflito entre mestres), `name?`, `folderId?` (nulo move à raiz) e o código **inteiro ou nada**: só parte das fontes é recusada com "source has only js; expected html, css and js together". Sem alteração nenhuma, a mensagem é "changes is empty; expected at least one of name, folderId, html, css, js".
- `sheetTemplateParamsDto` (`campaignId`, `templateId`) e `sheetTemplateResponseDto` (`{ template }`).
- Mensagem de orçamento: "html + css + js have N bytes; expected at most 524288".
- `sheetTemplateNameDto`, `sheetTemplateSourceShape` e `checkSheetTemplateSourceBudget` são exportados para o arquivo do modelo compor sem duplicar.

## Arquivo do modelo (`sheet-template-file.dto.ts`)

O `.lksheet` que o mestre exporta e importa: um JSON com o nome e o código de um modelo, nunca fichas, valores, dono ou versão.

- Constantes: `SHEET_TEMPLATE_FILE_FORMAT` (`"lorkarium.sheet-template"`), `SHEET_TEMPLATE_FILE_VERSION` (1), `SHEET_TEMPLATE_FILE_EXTENSION` (`.lksheet`) e `SHEET_TEMPLATE_FILE_MAX_BYTES` (2 MiB, o teto do corpo HTTP: o escape do JSON infla o código, então o arquivo maior é recusado antes da leitura e o orçamento real de 512 KiB fica com o DTO).
- Leitura em duas etapas:
  - `sheetTemplateFileHeaderDto` (objeto solto): `format` literal e `formatVersion` inteiro ≥ 1. Um arquivo de versão mais nova passa aqui, e o client diz "versão mais nova" em vez de "campo a mais";
  - `sheetTemplateFileDto` (estrito): `format`, `formatVersion` literal 1, `exportedAt?` (ISO), `name` (o mesmo do modelo, aparado, 1–60), `html`, `css`, `js` e o mesmo refine de orçamento.
- Mensagens: `format "outra.coisa"; expected lorkarium.sheet-template` e `formatVersion 2; expected 1`. Campo a mais (como `values`) é recusado pelo estrito.

## Valores (`sheet-values.dto.ts`)

- `SheetValueDto` é JSON fechado: string, número finito, booleano, `null`, array e objeto simples. `SheetValuesDto` é `Record<string, SheetValueDto>`.
- Orçamento: `SHEET_VALUES_MAX_BYTES` (256 KiB de JSON em UTF-8), `SHEET_VALUES_MAX_DEPTH` (8: o valor de uma chave da raiz está no nível 1), `SHEET_VALUES_MAX_KEYS` (1000 chaves somadas na árvore toda, as aninhadas também) e `SHEET_VALUE_KEY_MAX_LENGTH` (64).
- Chave: `[A-Za-z0-9_-]{1,64}`, nunca `__proto__`, `constructor` nem `prototype`. A recusa cita a chave entre aspas. Acento e espaço são recusados.
- Travessia iterativa, no molde do `documentContentDto`: chaves, profundidade, folhas e contagem são conferidas antes de serializar. Mais valores do que bytes do orçamento já é estouro, e um array maior que o orçamento é recusado antes de ser percorrido. Só objeto simples entra (`Date`, função, `undefined`, `NaN` e `±Infinity` caem). O resultado é uma cópia nova (`JSON.parse` do JSON medido), sem referência à entrada.
- `sheetValuesDto` são os valores guardados. `sheetValuesPatchDto` é o mesmo validador com ao menos uma chave: cada chave substitui a guardada inteira, e `null` apaga. O server confere de novo o resultado da mescla com `sheetValuesDto`.
- `updateSheetValuesRequestDto`: `{ actionId, changes }`, **sem** `expectedVersion`. A última escrita vence por chave, como as barras.

## Ficha (`sheet.dto.ts`)

- `sheetVisibilityDto`: `controllers` (padrão: mestres e controladores) | `table` (a mesa toda lê, e só mestres e controladores editam).
- `SHEET_NAME_MAX_LENGTH` (60) e `sheetNameDto` (aparado, 1–60).
- `sheetHolderDto`: `{ tokenId }` | `{ memberId }` (cada um estrito: os dois juntos, nenhum ou `userId` são recusados). O server resolve `{ memberId }` para o personagem do jogador e `{ tokenId }` de um token ligado para o personagem dele (Fase 9; não há `{ characterId }` no contrato).
- `sheetSummaryDto` (a linha da biblioteca, **sem valores**): `id`, `name`, `folderId` (nulo = raiz), `templateId`, `tokenId` (o token solto que guarda; nulo na ficha de personagem e na sem dono), `memberId` (o jogador do personagem que guarda; nulo em token solto, sem dono ou personagem sem jogador), `visibility`, `version`. O client lê `tokenId === null && memberId === null` como "sem dono". O DTO ainda descreve o `tokenId` como "a âncora de um personagem" (comentário velho em `packages/contracts`, não editado nesta fase).
- `sheetDto`: o resumo mais `values`, `canEdit` (escreve valores e barras) e `canManage` (nome, pasta, dono, visibilidade, modelo e exclusão: mestres).
- `sheetResponseDto`: `{ sheet, template: sheetTemplateCodeDto }`, para `GET …/sheets/:sheetId`. `tokenSheetsResponseDto`: `{ sheets: sheetSummaryDto[] }`, para `GET …/tokens/:tokenId/sheets` e `GET …/characters/:characterId/sheets` (mesma forma; o id do personagem na URL é validado pelo `setMainSheetCommandDto.shape.characterId`, não há `characterSheetParamsDto`).
- `campaignLibraryDto.sheets?` (`library/campaign-library.dto.ts`): resumos; o mestre recebe todas, os outros as que leem.
- Comandos, todos com `actionId`:
  - `createSheetRequestDto`: `templateId`, `name`, `folderId?` (nullable), `visibility?` e `holder?` (ausente = sem dono). Não há `tokenId` na raiz: o token vai em `holder`;
  - `updateSheetRequestDto`: `name?`, `folderId?` (nulo = raiz), `visibility?`, `templateId?` e `holder?` (`null` tira do dono), com ao menos um ("changes is empty; expected at least one of name, folderId, visibility, templateId, holder");
  - `deleteSheetRequestDto`: `{ actionId }`.
- `sheetParamsDto` (`campaignId`, `sheetId`) e `tokenSheetParamsDto` (`campaignId`, `tokenId`).
- `sheetReceiptDto`: `actionId`, `sheetId`, `version` e `operation` (`create` | `update` | `values` | `delete`), sem valores. `sheetWriteResponseDto` é `{ sheet, receipt }`.
- `sheetChangedEventDto` (`sheet:changed`): `campaignId`, `sheetId`, `version` e `at`. **Sem valores**: cada client relê pela rota, como no `library:changed`.
- `sheetAdjustBarCommandDto` (`sheet:adjustBar`): `actionId`, `campaignId`, `sheetId`, `barId` e `change`, que é o `barChangeDto` do `token:adjustBar` (`add` | `set` | `max` | `temp`). Não leva `tokenId` nem `sceneId`: o server resolve o dono da ficha (token solto → barra do token; personagem → barra do personagem e `character:changed`; sem dono → `SHEET_HAS_NO_TOKEN`). Ligado (B6) em `sheet-events.ts`: `SHEET_EVENTS` (`adjustBar: 'sheet:adjustBar'`, `changed: 'sheet:changed'`), `SheetClientEvents` (`'sheet:adjustBar': (command: SheetAdjustBarCommandDto, ack: (answer: BoardCommandAckDto) => void) => void`, o mesmo ack dos comandos do board) e `SheetServerEvents` (`'sheet:changed': (event: SheetChangedEventDto) => void`), somados a `TableClientEvents` e `TableServerEvents` no `board.dto.ts`. O `import type` do `BoardCommandAckDto` é um ciclo só de tipo, como o do `character.dto.ts`.

## Ponte frame ↔ host (`sheet-bridge.dto.ts`)

Mensagens pelo `MessagePort`, validadas nas duas pontas. Nenhuma mensagem do frame leva `tokenId`, `campaignId` ou `sheetId`, porque o host sabe qual ficha o frame é.

- `sheetBridgeRequestIdDto`: `[A-Za-z0-9_-]{1,64}` (`SHEET_BRIDGE_REQUEST_ID_MAX_LENGTH`). Um contador do SDK basta, porque só casa o `result`/`error` com o pedido.
- `sheetFrameMessageDto`, frame → host, discriminada por `type`. Todas levam `requestId`:
  - `ready`;
  - `bars.adjust`: `bar` (texto 1–64, `SHEET_BRIDGE_BAR_REFERENCE_MAX_LENGTH`: o id **ou** o rótulo da barra; o host resolve para o `barId` do `sheet:adjustBar`) e `change` (`barChangeDto`). O antigo `barId` é recusado (objeto estrito);
  - `dice.roll`: `expression` (a mesma regra da parte do `dice:roll`, aparada, 1–200), `label?` (`diceRollLabelDto`) e `visibility` (`public` | `masters`, padrão `public`);
  - `values.set`: `changes` (`sheetValuesPatchDto`);
  - `console` (sem `requestId`, o host nunca responde): `level` (`SHEET_CONSOLE_LEVELS`: `log`, `info`, `warn`, `error`, `debug`), `message` (até `SHEET_CONSOLE_MESSAGE_MAX_LENGTH` = 2000) e `at` (até `SHEET_CONSOLE_POSITIONS_MAX` = 8 `sheetConsolePositionDto` `{ line ≥ 1, column ≥ 0 }` do `srcdoc`, o topo da pilha primeiro);
  - `console.dropped`: `count` (≥ 1) de linhas que o frame não mandou pelo limite de taxa.
  - Tipos: `SheetConsoleMessageDto` (as duas acima) e `SheetFrameRequestDto` (as que o host responde).
- `sheetHostMessageDto`, host → frame:
  - `state`: `token` (`sheetFrameTokenDto`: `name` e `image`, que é `{ type: assetMimeTypeDto, bytes: ArrayBuffer }` ou `null`; o `token` todo é `null` na ficha sem token, com `bars: []`), `bars` (os `tokenBarDto` que o leitor já recebe, redigidos pelo server, até 8), `values` e `canEdit`;
  - `result`: `{ requestId }`;
  - `error`: `requestId` (nulo quando a mensagem nem pôde ser lida), `code` em `UPPER_SNAKE` (até 64; repassa o código do server ou o do host, como `RATE_LIMITED`) e `message` (até 500, `SHEET_BRIDGE_ERROR_MESSAGE_MAX_LENGTH`).
- Tipos de entrada `SheetFrameMessageInput` e `SheetHostMessageInput`, porque o `visibility` do dado tem padrão.

## Provas

Os specs ficam em `packages/contracts/test/sheets/` e em `test/utf8-length.spec.ts`. Cobrem os limites exatos e o excesso de uma unidade (512 KiB, 256 KiB, chave 64/65, profundidade 8/9, 1000/1001 chaves, `requestId` 64/65), além das chaves proibidas também aninhadas, `NaN`/`Infinity`, os campos de escolha do frame, o `tokenId`/`sceneId`/`userId` no `sheet:adjustBar`, os valores no `sheet:changed`, o nome 60/61, o `holder` (token, jogador, os dois, nenhum, `userId`, `null` no update) e o resumo sem valores (inclusive no `campaignLibraryDto.sheets`).

Treze mutações na fonte deixaram o spec certo vermelho pela asserção, e todas foram desfeitas:

- deny-list vazia;
- `>` por `>=` na profundidade, no orçamento e nas chaves;
- `json.length` no lugar dos bytes;
- `Number.isFinite` retirado;
- a cópia trocada pela entrada;
- a guarda de código parcial;
- a checagem de `ArrayBuffer`;
- `z.object` no lugar do estrito;
- o "changes is empty";
- o `.nullable()` do `state.token` e o teto de 64 do `bar` .

Driver do `/testar` sem achado.

## Armadilhas

- `JSON.parse('{"__proto__":1}')` cria a chave própria `__proto__`, mas o literal `{ __proto__: 1 }` muda o protótipo e não cria chave. O spec usa o `JSON.parse`, porque é o que chega pela rede.
- `ArrayBuffer` vindo de outro realm (o frame opaco) falha no `instanceof`. A imagem é conferida por `Object.prototype.toString`.
- O rótulo do dado montado pelo host ("<modelo> · <rótulo>") pode passar dos 40 caracteres do `diceRollLabelDto`. O host corta antes de enviar o `dice:roll`.
