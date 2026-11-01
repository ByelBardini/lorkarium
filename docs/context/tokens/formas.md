# Tokens — formas

Formas nomeadas do token (imagem, borda e tamanho), trocadas no mapa em um clique: o druida em lobo, o NPC que revela o dragão. Barras, condições, controle, camada e posição ficam. Hub: [`../tokens.md`](../tokens.md); DTOs em [`../contracts/formas.md`](../contracts/formas.md); caixa no game-core (`formBoxIn`, [`../game-core.md`](../game-core.md)). Plano: `docs/plans/2026-10-27-formas-do-token.md`.

## Banco (`tokens.po.ts`, migrações `0065_token_forms` e `0066_token_form_frame`)

- `token_forms`: `id`, `token_id` (→ `tokens`, **cascade**), `position` (0 = a base), `name`, `image_asset_id` (→ `assets`, **set null**: perder o asset devolve as iniciais à forma), `width`, `height` (`double precision`), `frame` (enum `token_frame`, `not null`, padrão `square`; a `0066` pôs toda forma que existia em `square`); único (`token_id`, `position`); `CHECK token_forms_size_half_cells` (de 0,5 a 10, de meia em meia: 0,3 é recusado). Até 8 por token (`TOKEN_FORMS_MAX`, pelo DTO). `TokenFormPo`; `TokenFormInputPo` = `{ id, name, imageAssetId, width, height, frame }` (o que uma escrita manda, na ordem).
- `tokens.active_form_id` (→ `token_forms`, **set null**): a forma que o token mostra. FK circular: o `drizzle-kit` cria as duas tabelas e depois os `ALTER TABLE … ADD CONSTRAINT`.
- Token ligado: formas e `active_form_id` são **do token** (a `0075` copiou as da âncora para cada ligado); o personagem só empresta imagem e borda ([`../characters/token-ligado.md`](../characters/token-ligado.md)).

## DAO

- `TokenRow.forms` (por posição). O `TokensDao.hangingOf` lê controladores **e** formas numa consulta só (`select` de `tokens` com duas subconsultas: `OWN_CONTROLLER_IDS` e `FORMS_OF_TOKEN`, um `json_agg` em `token-forms.dao.ts`): ler um token com formas custa o mesmo que sem (o `query-budget.spec.ts` não mudou).
- `token-forms.dao.ts` (`TokenFormsDao`, montado dentro do `TokensDao` com o mesmo executor): `replace(tokenId, forms)` = `DELETE … RETURNING id` e `INSERT` com `savedFormsOf(tokenId, forms, idsQueJaEram)`: **o id que o token já tinha fica; qualquer outro (novo do client, ou de forma de outro token) ganha id novo** — não colide na PK nem "rouba" a forma alheia. `copyBy(mapa)` copia as formas com ids novos e aponta cada cópia para a forma na mesma posição.
- `update(tokenId, { …, forms? })`: com `forms`, troca a lista **antes** do `UPDATE` do token (o apagar zera o `active_form_id` pelo FK; o `fields.activeFormId` que o service sempre manda o devolve quando a forma ficou). Sem `forms`, a lista fica.
- `insertMany`: formas (ids feitos no DAO) e o `active_form_id` (pelo `activeFormIndex` do `NewTokenRow`) entram no mesmo `WITH` das barras e controladores: o colar continua em 2 comandos (o FK da forma ativa é conferido no fim do comando).
- `copyScene` (Duplicar): copia o token com `active_form_id` nulo, depois as formas (`copyBy`) e remapeia a ativa. `delete`: as formas vão por cascade.
- Troca à mão zera a forma ativa no próprio `UPDATE`: `restyle` com imagem ou borda nova (`formKeptByLook`: `CASE WHEN image_asset_id IS DISTINCT FROM … OR frame::text <> … THEN NULL`; a mesma imagem ou borda mantém), a não ser que o estilo nomeie a forma (a troca); `resizeMany` com tamanho novo (`formKeptIfSameSize`, pelo `batchColumn` de `src/database/update-many.ts`).

## Regra (`token-forms.bo.ts`)

- `activeFormAfterEdit(mostrado, edição)` — a forma que fica depois de uma edição à mão: imagem nova, borda nova, tamanho novo ou a forma fora da lista → `null`. O `TokensService.update` aplica sempre no **token** (`withShownForm`, sobre o token composto: no ligado, a imagem comparada é a do personagem); tamanho novo do ligado zera a forma dele.
- `requireForm(tokenId, formas, formId)` → `TOKEN_FORM_NOT_FOUND` (`TokenFormNotFoundError`, "token X has no form Y; expected the id of one of its forms"; forma de outro token também). `requireActiveForm(tokenId, expect?, atual)` → `STALE_UNDO` ("token X is at form Y; the undo expected no form"). `formBoxOf(cena, caixa, forma)` = `formBoxIn` do game-core; forma maior que a cena → `OUT_OF_SCENE`. `isShowing(mostrado, forma, caixa)` — já está nela (forma, imagem e caixa iguais).

## Redação (`token-form.mapper.ts`)

- `toTokenFormsDto(formas, público)`: `privileged` recebe a lista inteira na ordem; `others`, `[]` (a lista revela as formas ainda não usadas). O `activeFormId` vai a todos. `toTokenFormInputsPo` (comando → linhas) e `pastedFormsOf(cópia)` (`{ forms, activeFormIndex }`; id ausente da lista = nenhuma).
- `lookAssetIdsOf` inclui a imagem de cada forma: `update` e `createMany` com imagem de outra mesa → `ASSET_NOT_FOUND` antes de gravar.

## `token:setForm` (`token-form.service.ts`)

- `TokenFormService.setForm(userId, campaignId, { sceneId?, tokenId, formId, expect? })` (plugin: `form`; borda: `tokenForm` no `board.gateway.ts`, pelo `mutate`; ack `{ ok, version }`). Quem: o mestre e quem controla, em **qualquer camada** (`requireControl('setForm')`, como o `restyleMany`).
- Fluxo: `inLockedGridWithCharacters` → `tokenIn` (outra mesa → `TOKEN_NOT_FOUND`; grid de outra mesa → `SCENE_NOT_FOUND`) → `requireControl` → `requireForm` (formas do holder, já compostas) → `requireActiveForm` → `formBoxOf` → já mostrando: **mesma versão, sem `bump` nem evento** → `linkedCharacterIn` (ligado: trava os personagens antes, rodando de novo) → `resizeMany` do token do grid → `restyle([token], { imageAssetId, frame, activeFormId })` → ligado: `restyleCharacters` com a imagem e a borda da forma (nessa ordem: o resize zeraria a forma do solto que muda de tamanho) → `veiledWriteOf`.
- Eventos `token:formChanged` (`BoardPublisherPort.tokenFormChanged`, adaptador `emitCuts`, fake `tokenFormChanges`): o do grid `{ tokenId, activeFormId, imageAssetId, frame, box }` na versão do grid, cortado pelo véu (`tokenSeenBy`: quem não vê o escondido recebe `board:advanced`, e as luzes veladas mudam com a caixa); ligado: antes, um `character:changed` com a imagem e a borda novas, na versão dos personagens.
- O client aplica a mesma regra da troca à mão ([`../client/token-forms.md`](../client/token-forms.md)): `token:restyledMany` com imagem ou borda nova e `token:resizedMany` com tamanho novo deixam o token sem forma (os eventos não carregam o `activeFormId`).

## Testes

- Unit: `token-forms.bo.spec.ts`, `token-form.mapper.spec.ts`, os casos de forma em `tokens.mapper.spec.ts` e `linked-token.spec.ts`, `tokens.service-forms.spec.ts` (update: ordem, `ASSET_NOT_FOUND`, forma mantida/zerada, id de outro token, ligado no próprio token) e `token-form.service.spec.ts` (diário `lock → save → save → bump → commit → publish`, borda, mesma forma sem `bump`, `TOKEN_FORM_NOT_FOUND`, `FORBIDDEN`, `STALE_UNDO`, camada Objetos, Quelm, ligado com `lock cast` antes do grid e um evento por cena). Fábricas `elfForm`, `wolfForm`, `ravenForm`, `lyraForms` em `tokens-factories.ts`; o `TokensDaoFake` imita o `replace` e os `CASE` da troca à mão.
- Integração: `token-forms-dao.spec.ts` (ordem e ids, mesma contagem de consultas, colar em 2 comandos, id mantido × novo, id de outro token, forma ativa largada, `CHECK` 0,3, asset apagado, Quelm, cascade, `copyScene` remapeado com a borda, `restyle` com imagem ou borda e `resizeMany` zerando), `token-forms.spec.ts` (Bia e Caio no sync, `ASSET_NOT_FOUND`, Quelm, colar; `token:setForm` a Ana, Bia e Caio e o sync seguinte, `FORBIDDEN`, `TOKEN_FORM_NOT_FOUND`, `TOKEN_NOT_FOUND`/`SCENE_NOT_FOUND`, `userId` forjado, reinício, a Lyra ligada no Salão e a Estrada com a imagem e o tamanho de lá) e o caso do Lobo escondido em `token-hidden-events.spec.ts`.

## Pendente

- Ligar um token com formas a um personagem (`token:linkToCharacter`) mantém as formas no token, e desligar também (o `TokenCharacterLinkDao` só troca barras, condições e controle).
- Editar a forma ativa (imagem ou tamanho) pelo `token:update` não reaplica no token: ele fica com a aparência antiga até a forma ser escolhida de novo (a troca para a mesma forma, nesse caso, grava — o `isShowing` compara imagem e caixa).
