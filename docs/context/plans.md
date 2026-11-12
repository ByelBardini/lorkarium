# Planos

Cada conta tem **um plano só** (`users.plan`: `free`, `apoiador`, `narrador`, `lenda`, `amigo_do_dono`). O **Apoiador** deixa as mesas na grade do Grátis (`PLAN_LIMITS.apoiador` = os números do `free`, `customColor: false`) e abre só a personalização da conta. A conta do @ em `OWNER_USERNAME` é o **Dono do Lorkarium** (não é plano: sem teto de plano, como o admin); ela, o selo único e o `UserHandle` em [`plans/selos.md`](plans/selos.md). Os limites da mesa seguem o plano do **dono** (`campaigns.owner_id`) e valem para todos os membros; as personalizações da conta seguem o plano da própria pessoa. A checagem mora sempre no server; o client só antecipa. A grade e os nomes estão em [`contracts/planos.md`](contracts/planos.md); o produto, em [`../spec.md`](../spec.md) §3.11.

## Regra efetiva (`server/src/modules/plans/plan-limits.bo.ts`)

- `effectiveLimitsOf({ role, plan, lorkariumOwner })` → `PlanLimits`: o admin global (`role = 'admin'`) e o Dono do Lorkarium recebem `PLAN_LIMITS.amigo_do_dono` qualquer que seja o plano; os outros, `PLAN_LIMITS[plan]`. O `plan` do resultado é o da grade aplicada (o deles sai `amigo_do_dono`).
- `customizationAllowed({ role, plan, lorkariumOwner })` → `boolean`: cor personalizada no perfil, no dado e nas cores salvas, textura do dado e foto em GIF. Verdadeiro para todo plano acima do Grátis (o `apoiador` incluído, mesmo com `customColor: false` na grade da mesa), o admin e o Dono; falso só para `free`.
- `PlanLimitsBo.requireRoom(resource, stored, adding, limits)` (estático; `resource` é um `PlanCountResource`): lança `PlanLimitError` quando `stored + adding` passa `limits[PLAN_COUNT_LIMIT_KEY[resource]]`. Passa sempre com:
  - limite `null` (sem teto de plano);
  - `adding <= 0`: quem já passou do limite mantém o que tem e segue editando (grandfathering; desligar luz ou bloqueador de quem desceu de plano abriria a névoa);
  - limite igual ou acima do teto técnico (o valor do `amigo_do_dono`): ali vale o erro técnico de hoje (`LIGHT_LIMIT`, `DOCUMENT_TAB_LIMIT`, `TOKEN_PATROL_LIMIT`…), o mesmo para todo plano. Por isso o serviço pode chamar o `requireRoom` antes ou depois da checagem técnica.
- `PlanLimitsBo.requireFeature(resource, allowed, limits)` (`resource` é um `PlanFeatureResource`): lança com `limit: 0` quando `allowed` é falso. `allowed` vem da grade (`limits.sceneCopy`, `limits.conditionImage`, `limits.auraKinds.includes(kind)`, `limits.customColor`) ou, para a conta, de `customizationAllowed(account)`; `limits` dá só o `plan` do erro.
- Dados com física acima de `maxDiceModelsPerRoll` não são recusados: saem sem modelo 3D (por isso não há recurso `diceModelsPerRoll` no erro).

## O erro (`plans.error.ts`, `plan-limit-response.ts`)

- `PlanLimitError` (código `PLAN_LIMIT`, `PLAN_LIMIT_CODE` do contracts): `resource`, `stored`, `adding`, `limit`, `plan`. Mensagem sem id, citando a conta e o teto: `would have 6 scenes; plan free allows at most 5` ou `plan free does not include sceneCopy`.
- HTTP: **403** com `{ code: 'PLAN_LIMIT', message, planLimit: { resource, limit, plan } }`. Todo `app.setErrorHandler` de módulo já é `withPlanLimitReply(<handler do módulo>)`, então a rota só lança o erro (do service ou do BO), sem linha na tabela de status. Módulo de rotas novo: envolva o handler do mesmo jeito. `planLimitErrorBody(error)` monta o corpo; `PLAN_LIMIT_STATUS = 403`.
- Socket.IO: o `toAckError` do `board-command-edge.ts` (todo comando do tabuleiro, dado e chat por `onCommand`) e o do `sessions.gateway.ts` já respondem o ack com `planLimitErrorBody(error)`; nada a acrescentar no `PUBLIC_MESSAGE`.

## Ler o plano do dono na trava

O plano é lido do banco na transação da escrita, nunca do `socket.data.user` (que guarda a identidade por até 15 dias e não veria uma troca de plano no backoffice):

- `new CampaignsDao(tx).lockWithOwner(campaignId)` → `CampaignWithOwnerPo | undefined` (`CampaignPo & { owner: UserPlanPo }`): o `lockById` (`FOR NO KEY UPDATE`) com `innerJoin(users)` na mesma consulta. Trava **só** a linha da mesa (`of: campaigns`), nunca a do dono. Uso: `effectiveLimitsOf(row.owner)`.
- `new UsersDao(tx).lockForPlan(userId)` → `UserPlanPo | undefined` em `FOR NO KEY UPDATE`: serializa duas escritas contadas contra o plano da mesma conta (criar mesa).
- `UserPlanPo` (`users.po.ts`) = `Pick<UserPo, 'role' | 'plan'>` + `lorkariumOwner` (não é coluna: `lorkariumOwnerSql`), o que `effectiveLimitsOf` e `customizationAllowed` aceitam. Toda leitura dele seleciona `PLAN_ACCOUNT_COLUMNS` (`users.dao.ts`); onde se lê `{ role, plan }` abaixo, é esse objeto.
- Provado em `server/test/integration/plan-owner-locks.spec.ts` (inclusive que a trava da mesa deixa a linha do dono livre); a regra em `server/test/modules/plans/plan-limits.bo.spec.ts`; o 403 em `plan-limit-response.spec.ts`; o ack em `board/board-command-edge.spec.ts`.

## Membros da mesa

Espectadores (toda entrada, por código ou Explorar), jogadores e co-mestres por mesa: contados por `CampaignMembersDao.countByRole` (sem dono nem juggernaut) com a mesa travada por `lockWithOwner`, na entrada (`CampaignJoinService`) e na troca de papel (`MemberRoleService`, pelo papel de destino; ir a espectador não conta). Detalhe em [`campaigns/papeis.md`](campaigns/papeis.md), Tetos do plano.

Personalizações da conta (plano **da pessoa**, não do dono da mesa): o `ProfilesService` lê `UsersDao.lockForPlan` a cada escrita e o `SavedColorsService` lê o plano no próprio `lockOwner`. Sem `customizationAllowed`: cor hex no perfil e qualquer `diceNumberColor` → `customColor`; textura do dado (arquivo e link, antes de baixar) → `diceTexture`; cor salva → `customColor`; a foto GIF não é recusada, sai parada (`animated: false` no processador). Detalhe em [`profiles.md`](profiles.md) e [`saved-colors.md`](saved-colors.md); provado em `server/test/integration/profile-plan-limit.spec.ts`. Spec de integração que usa cor hex, textura ou cor salva põe a conta num plano com personalização (`setAccountPlan` de `server/test/support/account-plans.ts`): conta de teste nasce `free`.

## Grids e mapas

- Grids por mesa (`scenes`) e duplicar (`sceneCopy`): o `LibraryService.editAndEvict` trava por `lockWithOwner` e passa os `limits` ao trabalho; `createScene` e `duplicate` contam `SceneLibraryBo.gridCount` (os grids da mesa já lidos na trava); o `duplicate` recusa `sceneCopy` antes de contar. Mapas por mesa (`libraryMaps`): `editAsMaster` (`library-maps.service.ts`) trava por `lockWithOwner` e entrega a linha ao trabalho; `create` conta `LibraryMapsDao.countOfCampaign`. Detalhe em [`library.md`](library.md) e [`library-maps.md`](library-maps.md).
- Provado em `server/test/integration/library-plan-limit.spec.ts`. Spec de integração que duplica, cria mais de 5 grids ou mais de 1 mapa na mesa põe o dono em `amigo_do_dono` (`setAccountPlan`).

## Fichas e documentos

- Modelos de ficha por mesa (`sheetTemplates`): `SheetTemplatesService.create` (importação `.lksheet` inclusa) conta `SheetTemplatesDao.countOfCampaign` sob o `lockWithOwner`.
- Fichas de NPC (`npcSheets`) = `token_sheets` com `token_id` não nulo (`SheetsDao.countHeldByTokens`): `requireNpcSheetRoom` (`sheets/npc-sheet-room.ts`) no `create` e no `update` que dá a um token uma ficha que nenhum token tinha. A ficha do personagem e a sem dono não contam.
- Abas por documento (`documentTabs`): `DocumentTabsBo.requireCreate(limits)`, depois do `DOCUMENT_TAB_LIMIT` técnico (o `tabLimit` do plugin continua `DOCUMENT_TABS_MAX`); os `limits` vêm de `DocumentWriteSteps.lockedTable`.
- Provado em `server/test/integration/sheets-plan-limit.spec.ts` e `documents-plan-limit.spec.ts`. Spec de integração que cria vários modelos na mesma mesa põe o dono em `amigo_do_dono` (`setAccountPlan`).

## Condições, dados e rolagens salvas

- Fluxo da mesa (personagens, lista de condições): `CharactersDao.lockVersion` traz o dono (`CharactersLockPo` `{ version, owner }`, trava só a mesa), e `LockedCharacters.owner` chega a toda obra do `inLockedCharacters`/`lockCharacters`/`inLockedGridWithCharacters`: `effectiveLimitsOf(locked.owner)`. É daí que a cor das condições (e qualquer checagem no `define`/`updateDefinition`) lê os limites; os comandos de condição num token (`apply`…) passam pela trava do grid.
- Imagem de condição (`conditionImage`): `ConditionRulesBo.requireImageInPlan` no `define` e no `updateDefinition`; a imagem que a definição já tem fica ([`combat/campos-da-condicao.md`](combat/campos-da-condicao.md)).
- Dados com física: `CampaignsDao.findOwnerPlan(campaignId)` (sem trava) a cada rolagem → `new DiceWavesBo(limits.maxDiceModelsPerRoll)`; o excedente sai do crypto ([`dice.md`](dice.md)).
- Rolagens salvas (`savedRolls`) e pastas (`savedRollFolders`), por membro e mesa: `SavedRollsDao.lockOwner` devolve o plano do dono na trava do membro; `SavedRollRulesBo.requireRoomFor(n, limits)` e `requireFolderRoom(n, max, limits)` ([`dice/salvas.md`](dice/salvas.md)).
- Spec de integração que precisa dos tetos de antes põe o dono em `amigo_do_dono` com `setAccountPlan` (`test/support/account-plans.ts`).

## Plano na conta (`/me`, perfil, `GET /api/account/plan`)

- `authUserDto` (o `/me`, o login e o `socket.data.user`) leva o `plan` gravado, `limits` (`planLimitsDto`: os **efetivos**, `effectiveLimitsOf`; o admin recebe os do `amigo_do_dono` com o `plan` gravado intacto) e `customization` (`customizationAllowed`). Montado em `toAuthUserDto` (`auth.mapper.ts`). No socket é só exibição: a escrita lê o plano na trava.
- `profileDto` (`GET`/`PATCH /api/account/profile`) leva o `plan`, `admin` e `lorkariumOwner` (o selo).
- `GET /api/account/plan` (cookie; 401 sem sessão) → 200 `accountPlanDto` = `{ plan, limits, customization, usage: { campaignsOwned, storageBytes } }`. `campaignsOwned` = `CampaignsDao.countOwnedBy(userId)` (mesas de que é **dona**, de qualquer status; a que só joga não conta); `storageBytes` = `AssetReferencesDao.usageOfOwner(userId, looseCutoffOf(now))` (as mesas de que é dona; soltos de mais de 24 h não contam). Fatia: `plans.dao.ts` (`PlansDao.accountOf(userId)`, sem trava, só para mostrar), `plans.mapper.ts` (`toAccountPlanDto`), `plans.service.ts` (`PlansService.accountPlanOf`), `plans.routes.ts` (handler em `withPlanLimitReply`), `plans.plugin.ts` (`createPlansModule({ db })`, registrado no `build-app.ts` depois das cores salvas). Provado em `server/test/integration/account-plan.spec.ts` e `server/test/modules/plans/plans.service.spec.ts`.

## Mesas como dono

- `CampaignsService.create`, dentro da transação de cada tentativa de código: `owners.lockForPlan(userId)` (`UsersDao`, `FOR NO KEY UPDATE` na linha do dono) → `campaigns.countOwnedBy(userId)` → `PlanLimitsBo.requireRoom('campaigns', owned, 1, effectiveLimitsOf(owner))` → insert. A trava do dono serializa duas criações simultâneas (a segunda conta depois do commit da primeira e recebe 403). Uma mesa `finished` conta. Provado em `server/test/integration/campaign-plan-limit.spec.ts` (inclusive a corrida) e `server/test/modules/campaigns/campaigns.service-plan.spec.ts`.

## Tabuleiro

- O `AddressedSceneRow` (`ScenesDao.lockInCampaign`, `shareInCampaign`, `findGridInCampaign`) traz `owner: { role, plan, lorkariumOwner }` pelo `join` em `users` na mesma consulta da trava (só a linha do grid fica travada). Todo comando do `inLockedGrid` lê os limites da mesa por `effectiveLimitsOf(locked.scene.owner)`, sem consulta a mais.
- Tokens: `TokenPlanBo` (`tokens/token-plan.bo.ts`, montado por `tokenPlanOf(scene)`) recusa `tokenBars`, `tokenForms`, `auraKind` e `sightBlockers` em `token:create`, `token:update`, `token:createMany` e `token:restyleMany`; patrulhas (`patrols`) no `TokenPatrolBo.start`; barras do SDK da ficha e do modelo pelo `SheetBarCreationBo(sheetId, limits)` e `giveManifestBars`. Detalhe em [`tokens/plano.md`](tokens/plano.md).
- Luzes por cena (`lights`): `LightRulesBo({ scene, limit, plan }).admit` ([`lights.md`](lights.md)).
- Os limites ficam à mão de outra checagem do mesmo comando: `TokenPlanBo.limits` e `LightRulesBo.plan`.
- Provado em `server/test/integration/board-plan-limit.spec.ts`. Spec de integração de token, luz ou barra de ficha que passa da grade do `free` põe os donos em `amigo_do_dono` (`setAccountPlan`).
- Dar ficha a um personagem (`SheetsService.create`/`update` → `giveManifestBars`) passa os `limits` da trava da mesa no `ManifestBarsGift`: as barras do modelo param no teto do plano (`skippedBars`), como no token solto.

## Cor personalizada no conteúdo da mesa (`plans/custom-color-plan.bo.ts`)

- `CustomColorPlanBo.requirePaletteUnlessAllowed(cor, limits)` (estático): cor `#rrggbb` (`isHexColor` do contracts) sem `limits.customColor` → `PlanLimitError` `customColor` (`limit: 0`); nome da paleta, `null` e ausente passam. `requirePaletteUnlessHeld(enviadas, guardadas, limits)`: na edição, só o hex que a peça **ainda não tem** é recusado (grandfathering: quem desceu de plano mantém e edita o hex de antes; voltar à paleta passa).
- Plano do **dono** da mesa, lido na trava (o mesmo `owner` dos outros tetos):
  - `drawing:createMany` (`stroke` e `fill`); mover e apagar não olham cor.
  - `effectArea:createMany`; `effectArea:reshapeMany` contra a cor gravada da área.
  - Tokens, pelo `TokenPlanBo`: `TokenPlanHold.colors` (barras, aura e luz guardadas, `tokenPlanHoldOf`) × `TokenPlanSent.colors` (barras e luz, `tokenPlanSentOf`) + `aura.color`, no `requireNew` (`token:create`, cada cópia do `token:createMany`), no `requireChange` (`token:update`) e no `requireAuraOnEach(holds, aura)` (`token:restyleMany`, por token). O método é `requireColors(guardadas, enviadas)`.
  - `light:createMany` e `light:setColorMany` (contra a cor gravada), com `LightRulesBo.plan`.
  - `condition:define` e `condition:updateDefinition` (contra a cor da definição), com `effectiveLimitsOf(locked.owner)`, junto do `requireImageInPlan`.
- Livres em todo plano (não têm paleta): a cor do lugar de mapa, a cor de texto de documento e o tom da capa (provado pelos specs que já os gravam em conta `free`: `library-map-regions.spec.ts`, `campaign-settings.spec.ts`).
- O desfazer de um apagar e a colagem são criação: um hex de antes volta só num plano com `customColor`.
- Provado em `server/test/integration/custom-color-plan-limit.spec.ts` (um `it` por comando, o grandfathering na reforma, na barra, na condição e no mover, `narrador` aceita tudo, Quelm lê o plano do Caio) e `server/test/modules/plans/custom-color-plan.bo.spec.ts`, `tokens/token-plan.bo.spec.ts`. Spec de integração que grava hex em desenho, área, aura, barra, luz ou condição põe o dono em `amigo_do_dono` (`setAccountPlan`).

## Armazenamento e resolução

- Cota (`storage`, `maxStorageBytes`) somando os assets das mesas do dono, conferida em todo envio depois de normalizar e antes do `put`, sob `lockWithOwner` + `lockForPlan` do dono; lado do mapa (`maxMapSide`) e do fundo (`maxBackgroundSide`) pelo plano do dono; varredura dos soltos e remoção na exclusão da mesa. Detalhe em [`assets/cota-e-varredura.md`](assets/cota-e-varredura.md); provado em `server/test/integration/assets-plan-limit.spec.ts` e `asset-sweep.spec.ts`.

## Banco

- Migração `0104_user_plans`: enum `user_plan` (`free`, `apoiador`, `narrador`, `lenda`, `amigo_do_dono`) e `users.plan` (`notNull`, padrão `free`); não há coluna de Apoiador; o `UPDATE` à mão põe todo não admin em `amigo_do_dono` (o admin fica `free`, sem efeito: o admin não tem limite de plano). Conta nova nasce `free`. Provado em `server/test/integration/user-plans-migration.spec.ts`.

## Na mesa: selos e limites do dono

- Cada membro do roster (`sessionMemberDto`, também no `memberJoined`/`memberUpdated`) e do detalhe (`campaignMemberDto`) leva o plano **gravado**, `admin` e `lorkariumOwner` (`accountSealFieldsOf` do `campaigns.mapper.ts`): o cliente escolhe o selo único. Detalhe em [`plans/selos.md`](plans/selos.md).
- O `campaignInfoDto` leva `limits` = `effectiveLimitsOf(dono)`; chega no resumo da lista, no detalhe (`GET /campaigns/:id`, de onde o client parte) e no `session:campaignUpdated`. O card do Explorar (`publicCampaignDto`) fica sem `limits`.
- De onde vem: o `CampaignMemberRow` do `listMembers` traz `account` (`PLAN_ACCOUNT_COLUMNS`) de `users` (o do dono dá os limites do detalhe); o `CampaignListingRow` do `listOfUser` traz `owner` pelo `join` do dono que já existia. Leitura sem trava: quem grava contra o plano relê na trava (acima).
- `planLimitsDto` mora em `plans/plan-limits.dto.ts` (folha, só zod e `user-plan.dto`); o `plan-limits.ts` (a grade, que lê os tetos técnicos dos DTOs do tabuleiro) o reexporta. Importar o `plan-limits.ts` num DTO de conta ou de mesa fecha o ciclo `api-error.dto → admin-users.dto → auth-user.dto → plan-limits → board/* → realtime-ack.dto → api-error.dto` e quebra o carregamento do zod.
- A troca no backoffice (`PATCH /admin/users/:id/plan`, onde o Apoiador também é escolhido, e o papel em `PATCH /admin/users/:id`, [`user-admin.md`](user-admin.md)) avisa as mesas vivas: o selo pelo `session:memberUpdated`; o plano e o papel também os limites das mesas do dono pelo `session:campaignUpdated`.
- Provado em `server/test/integration/session-plan.spec.ts` (roster, detalhe, lista, dono admin, isolamento), `user-admin-plan.spec.ts` e nos specs de mapper (`campaigns.mapper.spec.ts`, `sessions.mapper.spec.ts`).

## Client: selo e backoffice

- Um selo só por conta (Dono > Admin > Amigo do Dono > Lenda > Narrador > Apoiador), símbolo próprio no traço da logo colado ao @ (`UserHandle`) ou ao nome: [`plans/selos.md`](plans/selos.md).
- "Seu plano" (última seção de `/account`: cartão do plano com o selo grande — Dono e admin veem quem são, não o plano gravado —, personalizações, uso e a grade dos planos abertos, com a coluna do Amigo do Dono só para quem o tem e "Limites especiais" para Dono e admin): [`client/account.md`](client/account.md), Seu plano.
- O backoffice troca o plano (o Apoiador incluído) pelo submenu "Plano" da linha (`changePlan` do `user-admin-api.ts`); detalhe em [`client/backoffice.md`](client/backoffice.md).

## Client: frase da recusa e limites no estado

- A frase: `planLimitMessage(planLimit)` (`client/src/lib/plan-limit-message.ts`), sobre a grade `PLAN_LIMITS` e os nomes `PLAN_NAMES` do `lib/plan-seal.ts`:
  - teto da mesa: "Esta mesa usa o plano Grátis, que permite até 5 grids. O Narrador libera 20." (o próximo plano à venda, Narrador ou Lenda, com teto maior; nenhum → só a primeira frase; o Amigo do Dono nunca é oferecido);
  - mesas como dono (`campaigns`) fala do plano da pessoa: "Seu plano Grátis permite até 1 mesa como dono. …"; armazenamento em MB/GB (`byteSizeText`);
  - recurso ausente (feature, ou teto 0 como patrulha e bloqueio no Grátis): "Aura com efeito ou imagem está nos planos pagos.";
  - uso justo da Lenda (`PLAN_FAIR_USE_RESOURCES`): "Esta mesa chegou ao limite de uso justo (500 grids)."
  - Os rótulos por recurso (`PLAN_COUNT_LABEL`, `PLAN_FEATURE_LABEL`) e `amountText(resource, n)` moram ali. `PLAN_LIMIT_FALLBACK` é o texto onde só o `kind` chega (as regiões do mapa).
- A leitura: `planLimitFailureOf(response)` (`services/api-call.ts`) → `PlanLimitFailure = { kind: 'plan_limit', planLimit }`, checado primeiro no mapeamento de recusa de cada serviço que o server pode recusar pelo plano (campanhas, biblioteca, mapas, modelos e fichas, documentos, rolagens salvas, assets; perfil e cores salvas por `planAwareFailureOf` do `account-failure.ts`). Nos acks, `ackFailureOf(error)` (`board-command-sender.ts`) dá o mesmo objeto em `BoardCommandFailure` (= `BoardFailureCode | PlanLimitFailure`), usado por todo comando do tabuleiro, das condições, do vínculo de token, da ativação e do ping.
- A tela: cada função de mensagem do serviço começa por `plan_limit` → `planLimitMessage` (`boardCommandFailureMessage`, `commandFailureMessage` das mesas, `libraryFailureMessage`, `libraryMapRefusalMessage`, `sheetTemplateRefusalMessage`, `sheetCommandFailureMessage`, `documentFailureMessage`, `savedRollFailureMessage`, `imageFailureMessage`, `accountFailureMessage` e o painel de cor personalizada). Na ponte da ficha o pedido volta recusado com o código `PLAN_LIMIT`.
- Limites da mesa: `OpenTable.limits` (`stores/open-tables-store.ts`) começa `null` e vem de cada `session:campaignUpdated` (troca de plano no backoffice); `selectTableLimits(state, campaign)` → os vivos, ou os do `campaign.limits` da rota antes do primeiro evento (o mesmo molde do `tokenRights`).
- Limites da conta: `selectAccountLimits(state)` (`stores/session-store.ts`) → `{ plan, limits, customization }` do `/me` (o próprio `AuthUserDto`), ou `null` sem sessão.
- Provado em `client/test/lib/plan-limit-message.spec.ts`, `services/api-call.spec.ts`, `services/board-command-sender.spec.ts`, `services/campaigns-api.spec.ts`, `stores/open-tables-store.spec.ts`, `stores/session-store.spec.ts` e nos specs de mensagem (tabuleiro, mesas, documentos).

## Client: botões de criar e recursos desligados

- `usePlanLimits()` (`client/src/features/plans/use-plan-limits.ts`; provedores em `plan-limits-providers.tsx`) dá os limites da conta (`AccountPlanProvider` no shell) e da mesa (`TablePlanLimitsProvider` na rota da mesa e em volta do documento aberto); `countGate`/`featureGate` (`plan-gate.ts`) dizem se o controle se oferece e a frase (a da recusa, ou "Disponível no Narrador").
- Desabilitados com a frase: "Nova mesa", os cards Grid/Mapa/Modelo de ficha, "Duplicar", "Importar modelo…", "Nova ficha ▸" de token solto, "Nova aba", Efeito/Imagem da aura, patrulha, "Bloqueia a visão", a imagem da condição e o ladrilho de cor personalizada (`scope` conta ou mesa); Chat e Imagens não abrem a janela. Barras, formas e luzes não mudam de botão. O que já existe acima do plano continua editável (grandfathering).
- Detalhe e tabela de controles em [`plans/client-controles.md`](plans/client-controles.md).

## Ponta a ponta (e2e)

- `e2e/test/plans.spec.ts`, grupo `plans` (~50 s com o boot: `--project=plans --workers=1`): o admin põe a Bia no Grátis pelo backoffice e a home dela desabilita "Nova mesa" com "Seu plano Grátis permite até 1 mesa como dono. …"; o admin a põe na Lenda e o símbolo do selo no cartão dela na tela do Caio (aberto na aba "Na mesa") troca de nome acessível, "Amigo do Dono" por "Plano Lenda", sem recarregar; na mesa Grátis com 5 grids o card "Grid" do "Novo item" fica desabilitado com a frase do plano e o `POST …/scenes` dá 403 `PLAN_LIMIT` (`scenes`, 5, `free`); o Caio (`amigo_do_dono`) cria a 2ª mesa. Cada teste devolve a Bia ao `amigo_do_dono` no `afterEach`.
- Bia e Caio nascem `amigo_do_dono` no seed (`DevPlayersSeedService`, também o do banco `_e2e`) e o admin do e2e não tem limite: os outros specs não sentem o plano. Spec que precise de outro plano usa `setPlanOf(admin, 'bia', 'free')` (`e2e/test/support/plans.ts`, `PATCH /api/admin/users/:id/plan` com o cookie do admin) e devolve o plano no fim.
