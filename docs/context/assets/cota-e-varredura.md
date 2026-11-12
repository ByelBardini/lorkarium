# Assets — resolução por plano, cota e varredura

Hub: [`../assets.md`](../assets.md). O plano que vale é o do **dono** da mesa (regra efetiva em [`../plans.md`](../plans.md)).

## Lado por plano (`asset-quota.bo.ts`)

- `planSidesOf(ASSET_MAX_SIDE, limits)` → `SideLimits`: `library_map` = menor entre o técnico (8192) e `maxMapSide`; `background` = menor entre o técnico (4096) e `maxBackgroundSide`; as outras finalidades ficam no técnico. Grátis: mapa 4096, fundo 2048; Narrador em diante: o técnico.
- O `AssetsService` lê o plano **sem trava** antes de decodificar (`tableOwners.findOwnerPlan(campaignId)`, `CampaignsDao`) em `uploadFor` e `importFor` e passa os lados ao `keptAs(purpose, sides)` → `resizeFor`. O `uploadSheetTemplateAsset` usa o técnico (a finalidade não depende do plano). Só a cota decide escrita; o lado é só o tamanho da saída.

## Cota de armazenamento

- Uso do dono = soma de `size_bytes` dos assets de todas as mesas de que ele é **dono** (`campaigns.owner_id`), menos os **soltos** criados há mais de 24 h (`LOOSE_ASSET_GRACE_MS`, `looseCutoffOf(now)`). Mesa em que só joga não conta. O admin e o `amigo_do_dono` não têm teto (`maxStorageBytes: null`).
- Solto = nenhuma referência (abaixo). A idade é a do envio (`created_at`): não há coluna "solto desde", então um arquivo antigo que deixa de ser usado sai na varredura seguinte, sem esperar mais 24 h.
- `AssetsService.keepWithin` (todo envio: `upload`, `importLink`, imagem de documento e de ficha, imagem e fonte do modelo), depois de normalizar e **antes do `put`**, numa transação (`keeping`, montada no `assets.plugin.ts`): `CampaignsDao.lockWithOwner(campaignId)` → `UsersDao.lockForPlan(ownerId)` (serializa todo envio das mesas do dono) → `AssetReferencesDao.usageOfOwner(ownerId, cutoff)` → `PlanLimitsBo.requireRoom('storage', usado, bytes normalizados, effectiveLimitsOf(dono))` → `put` → `insert`. Recusa: 403 `PLAN_LIMIT` `{ resource: 'storage', limit, plan }` e nada vai ao S3. Mesa sumida entre a participação e a trava → `CAMPAIGN_NOT_FOUND`.
- `GET /api/account/plan` mostra o mesmo número em `usage.storageBytes` (`PlansService`, `AssetReferencesDao` sem trava).
- `size_bytes` é `integer`: um arquivo cabe (até 20 MiB), a soma sai `numeric` → `Number`.

## Referências (`asset-references.dao.ts`)

- `ASSET_FOREIGN_KEYS`: toda coluna com FK para `assets.id` — `campaigns.cover_asset_id`/`photo_asset_id`/`banner_asset_id`, `scenes.background_asset_id`, `tokens.image_asset_id`/`aura_image_asset_id`, `token_forms.image_asset_id`, `characters.image_asset_id`/`aura_image_asset_id`, `condition_definitions.image_asset_id`, `library_images.asset_id`, `library_maps.asset_id`, `library_document_assets.asset_id`, `sheet_assets.asset_id`. Mais a referência sem FK: `sheet_templates.manifest -> 'assets'` (o `assetId` declarado, na mesma mesa).
- Cada uma vira um `NOT EXISTS` no topo do `WHERE` (o planner faz _anti join_; nenhuma dessas colunas tem índice). `assetReferenceColumns()` lista `tabela.coluna`.
- `usageOfOwner(ownerId, cutoff)`, `unreferencedOlderThan(cutoff, limit)` (`FOR UPDATE` nas linhas de `assets`), `deleteUnreferenced(ids, cutoff)` (confere de novo, num comando novo, e devolve as chaves apagadas) e `claimSweep()` (`pg_try_advisory_xact_lock` com chave fixa).

## Varredura (`asset-sweep.service.ts`, `src/app/wire-asset-sweep.ts`)

- `AssetSweepService.sweep()` → `{ deleted, removed }`: lotes de 500, cada um numa transação: `claimSweep` (outra instância varrendo → sai sem nada) → `unreferencedOlderThan` → `deleteUnreferenced`. Os objetos saem **depois do commit** por `removeAssetObjects(storage, chaves, log)` (`asset-object-removal.ts`) (o `storage` do `wireAssetStorage`: com o cache em disco ligado, a cópia local sai junto, ver [`cache-em-disco.md`](cache-em-disco.md)): falha no `remove` não volta a linha, vai ao log (`warn`, com `storageKey`) e o objeto fica órfão. Lote cheio → outro lote; lote que não apagou nada encerra.
- `wireAssetSweep(app, { db, storage, clock })` no `buildApp`, logo depois do módulo de assets: a primeira varredura 1 h depois do `onReady`, depois a cada hora (`ASSET_SWEEP_INTERVAL_MS`, `TimerScheduler`), até o `onClose`. Sem env nova. Erro da varredura vai ao `app.log.error` e a próxima roda.
- Fica fora do housekeeping ([`../housekeeping.md`](../housekeeping.md)), de propósito: aquele apaga linhas de tabelas fixas por um `DELETE` em lote no `db`; esta precisa de transação por lote com `claimSweep`, do `FOR UPDATE` contra quem grava a referência e de tirar os objetos do S3 depois do commit.
- Corrida com quem referencia: a FK de quem grava a referência pega `KEY SHARE` na linha do asset, que o `FOR UPDATE` da varredura bloqueia; quem grava espera e depois falha pela FK. O manifesto do modelo (sem FK) não trava: um modelo salvo declarando um arquivo de mais de 24 h no mesmo instante da varredura pode perdê-lo.

## Exclusão da mesa

`CampaignSettingsService.delete`: na transação `removal` (`campaigns.plugin.ts`), `lockById` (espera um envio em curso, que trava a mesa) → `AssetsDao.storageKeysOf(campaignId)` → `delete` (a cascata leva as linhas). Depois do commit: `forgetCampaign`, `campaignDeleted` e `removeAssetObjects` com o `storage` e o `app.log` que o `buildApp` passa no `pluginWith` (`objects`, `log`). A exclusão de conta no backoffice (que leva as mesas do dono) ainda não remove os objetos delas.

## Testes

- Unit: `test/modules/assets/asset-quota.bo.spec.ts`, `assets.service-plan.spec.ts` (lado por plano, cota antes do `put`, trava do dono decide), `asset-sweep.service.spec.ts`; `campaigns/campaign-settings.service.spec.ts` (objetos depois do commit). Fakes em `test/support/asset-quota-fakes.ts` (`assetQuotaOver`, `StorageUsageFake`, `AssetSweepDaoFake`, `FlakyRemovalStorageFake`, `RemovalLogFake`); `CampaignRemovalFake` em `campaign-settings-fakes.ts`.
- Integração: `assets-plan-limit.spec.ts` (8000 px → 4096 no Grátis, 8000 no Narrador, 403 `storage`, uso com e sem referência, isolamento) e `asset-sweep.spec.ts` (25 h sai, 23 h fica, fundo de grid fica, falha do `remove`, trava, exclusão da mesa no S3 real e a lista de colunas igual às FKs do `pg_constraint`: tabela nova com FK para `assets` deixa o spec vermelho até entrar no `ASSET_FOREIGN_KEYS`).
- Spec de integração que envia mapa ou fundo acima de 4096/2048 px, ou guarda mais de 100 MB, põe o dono num plano acima do Grátis (`setAccountPlan`).
