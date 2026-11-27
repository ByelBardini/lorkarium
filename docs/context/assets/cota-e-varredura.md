# Assets — resolução por plano, cota e varredura

Hub: [`../assets.md`](../assets.md). O plano que vale é o do **dono** da mesa (regra efetiva em [`../plans.md`](../plans.md)).

## Lado por plano (`asset-quota.bo.ts`)

- `planSidesOf(ASSET_MAX_SIDE, limits)` → `SideLimits`: `library_map` = menor entre o técnico (8192) e `maxMapSide`; `background` = menor entre o técnico (4096) e `maxBackgroundSide`; as outras finalidades ficam no técnico. Grátis: mapa 4096, fundo 2048; Narrador em diante: o técnico.
- O `AssetsService` lê o plano **sem trava** antes de decodificar (`tableOwners.findOwnerPlan(campaignId)`, `CampaignsDao`) em `uploadFor` e `importFor` e passa os lados ao `keptAs(purpose, sides)` → `resizeFor`. O `uploadSheetTemplateAsset` usa o técnico (a finalidade não depende do plano). Só a cota decide escrita; o lado é só o tamanho da saída.

## Cota de armazenamento

- Uso do dono = soma de `size_bytes` dos assets de todas as mesas de que ele é **dono** (`campaigns.owner_id`), menos os **soltos** criados há mais de 24 h (`LOOSE_ASSET_GRACE_MS`, `looseCutoffOf(now)`). Mesa em que só joga não conta. O admin e o `amigo_do_dono` não têm teto (`maxStorageBytes: null`).
- Solto = nenhuma referência (abaixo). A `chat_image` é solta por desenho: conta na cota por 24 h e sai na varredura seguinte ([`imagens-do-chat.md`](imagens-do-chat.md)).
- Solto = nenhuma referência (abaixo). A idade é a do envio (`created_at`): não há coluna "solto desde", então um arquivo antigo que deixa de ser usado sai na varredura seguinte, sem esperar mais 24 h.
- `AssetsService.keepWithin` (todo envio: `upload`, `importLink`, imagem de documento e de ficha, imagem e fonte do modelo), depois de normalizar e **antes do `put`**, numa transação (`keeping`, montada no `assets.plugin.ts`): `CampaignsDao.lockWithOwner(campaignId)` → `UsersDao.lockForPlan(ownerId)` (serializa todo envio das mesas do dono) → `AssetReferencesDao.usageOfOwner(ownerId, cutoff)` → `PlanLimitsBo.requireRoom('storage', usado, bytes normalizados, effectiveLimitsOf(dono))` → `put` → `insert`. Recusa: 403 `PLAN_LIMIT` `{ resource: 'storage', limit, plan }` e nada vai ao S3. Mesa sumida entre a participação e a trava → `CAMPAIGN_NOT_FOUND`.
- `GET /api/account/plan` mostra o mesmo número em `usage.storageBytes` (`PlansService`, `AssetReferencesDao` sem trava).
- `size_bytes` é `integer`: um arquivo cabe (até 20 MiB), a soma sai `numeric` → `Number`.

## Referências (`asset-references.dao.ts`)

- `ASSET_FOREIGN_KEYS`: toda coluna com FK para `assets.id` — `campaigns.cover_asset_id`/`photo_asset_id`/`banner_asset_id`, `scenes.background_asset_id`, `tokens.image_asset_id`/`aura_image_asset_id`, `token_forms.image_asset_id`, `characters.image_asset_id`/`aura_image_asset_id`, `condition_definitions.image_asset_id`, `library_images.asset_id`, `library_maps.asset_id`, `library_document_assets.asset_id`, `sheet_assets.asset_id`, `round_cycle_phases.image_asset_id`, `saved_tokens.image_asset_id`/`aura_image_asset_id`, `saved_token_forms.image_asset_id`. Mais a referência sem FK: `sheet_templates.manifest -> 'assets'` (o `assetId` declarado, na mesma mesa).
- Cada uma vira um `NOT EXISTS` no topo do `WHERE` (o planner faz _anti join_; nenhuma dessas colunas tem índice). `assetReferenceColumns()` lista `tabela.coluna`.
- `usageOfOwner(ownerId, cutoff)`, `unreferencedOlderThan(cutoff, limit)` (`FOR UPDATE` nas linhas de `assets`), `deleteUnreferenced(ids, cutoff)` (confere de novo, num comando novo, e devolve as chaves apagadas) e `claimSweep()` (`pg_try_advisory_xact_lock` com chave fixa).

## Varredura (`asset-sweep.service.ts`, `src/app/wire-asset-sweep.ts`)

- `AssetSweepService({ transaction, clock, batchSize }).sweep()` → `{ deleted }`: lotes de 500, cada um numa transação (`AssetSweepScope { references, deletions }`): `claimSweep` (outra instância varrendo → sai sem nada) → `unreferencedOlderThan` → `deleteUnreferenced` → `deletions.enqueue(chaves)` no **mesmo** `tx`. A varredura não fala com o S3: os objetos saem pela fila abaixo. Lote cheio → outro lote; lote que não apagou nada encerra.
- `wireAssetSweep(app, { db, storage, clock })` no `buildApp`, logo depois do módulo de assets: a primeira varredura 1 h depois do `onReady`, depois a cada hora (`ASSET_SWEEP_INTERVAL_MS`, `TimerScheduler`), até o `onClose`. Sem env nova. Erro da varredura vai ao `app.log.error` e a próxima roda.
- Fica fora do housekeeping ([`../housekeeping.md`](../housekeeping.md)), de propósito: aquele apaga linhas de tabelas fixas por um `DELETE` em lote no `db`; esta precisa de transação por lote com `claimSweep`, do `FOR UPDATE` contra quem grava a referência e de enfileirar as chaves no mesmo `tx`.
- Corrida com quem referencia: a FK de quem grava a referência pega `KEY SHARE` na linha do asset, que o `FOR UPDATE` da varredura bloqueia; quem grava espera e depois falha pela FK. O manifesto do modelo (sem FK) não trava: um modelo salvo declarando um arquivo de mais de 24 h no mesmo instante da varredura pode perdê-lo.

## Fila de remoção (`storage_deletions`, `0116_storage_deletions.sql`)

- Por que existe: remover o objeto depois do commit e só logar a falha deixava órfão no bucket a cada S3 fora do ar. Com a fila, quem apaga a linha grava a chave **na mesma transação**: rollback leva as duas; commit deixa a promessa de remover guardada até o `remove` dar certo.
- Tabela `storage_deletions` (`storage-deletions.po.ts`): `key` text PK (qualquer chave do bucket: `assets/`, `avatars/`…), `attempts` int (falhas até agora), `next_attempt_at` timestamptz (indexado; padrão `now()`), `enqueued_at`. Global, sem campanha: é só a chave de um objeto cuja linha já sumiu.
- `StorageDeletionsDao(db | tx)`: `enqueue(keys)` (`ON CONFLICT DO NOTHING`: a chave já na fila mantém as tentativas; lista vazia não consulta), `due(now, limit)` (`next_attempt_at <= now`, a mais antiga primeiro), `forget(key)`, `postpone(key, attempts, nextAttemptAt)`.
- `StorageDeletionsService({ queue, storage, clock, log, batchSize }).drain()` → `{ removed, failed }`: lê as vencidas em lotes; `remove` deu certo → `forget`; falhou → `postpone` com `attempts + 1` e espera crescente (`STORAGE_DELETION_BACKOFF_MS`: 1 min, 5 min, 30 min e 6 h daí em diante). Até a 9ª falha vai ao log como `warn`; da 10ª (`STORAGE_DELETION_ALERT_ATTEMPTS`) em diante como `error`, e a chave **continua** na fila: nunca sai sem o objeto sair. `remove` é idempotente, então tirar duas vezes (o `forget` que falhou depois do `remove`) não quebra nada.
- `wireAssetSweep` liga o `drain` (`storageDeletionsOver`, lote de 100) a cada 5 min (`STORAGE_DELETIONS_INTERVAL_MS`) no mesmo `TimerScheduler` da varredura; cada tarefa agenda a próxima só quando a atual termina, e erro vai ao `app.log.error`. O `storage` é o do `wireAssetStorage` (com o cache em disco, a cópia local sai junto).
- A chave vence pelo `now()` do Postgres e o `drain` compara com o relógio do app: uma diferença de milissegundos só adia a remoção para o ciclo seguinte.
- Os prints das denúncias (`reports/<id>`) também saem por aqui: a guarda das denúncias enfileira as chaves na transação que apaga a denúncia ou o print solto ([`../reports.md`](../reports.md), Guarda).

## Exclusão da mesa

`CampaignSettingsService.delete`: na transação `removal` (`campaigns.plugin.ts`, `CampaignRemovalScope { campaigns, assets, deletions }`), `lockById` (espera um envio em curso, que trava a mesa) → `deletions.enqueue(AssetsDao.storageKeysOf(campaignId))` → `delete` (a cascata leva as linhas). Falha depois do `enqueue` desfaz as duas. Depois do commit só `forgetCampaign` e `campaignDeleted`: nenhum caminho remove objeto direto, o `pluginWith` não recebe mais o bucket nem o log.

A exclusão da conta no backoffice leva as mesas de que ela é dona pela cascata e enfileira, na mesma transação, as chaves dos arquivos delas e as imagens da conta (foto, textura do dado, banner): ver [`../user-admin.md`](../user-admin.md).

## Testes

- Unit: `test/modules/assets/asset-quota.bo.spec.ts`, `assets.service-plan.spec.ts` (lado por plano, cota antes do `put`, trava do dono decide), `asset-sweep.service.spec.ts` (chaves na fila no mesmo `tx` do lote), `storage-deletions.service.spec.ts` (o `drain`: sai só o que removeu, espera crescente, `error` da 10ª falha); `campaigns/campaign-settings.service.spec.ts` (as chaves na transação da exclusão; falha depois do `enqueue` não deixa nada). Fakes em `test/support/asset-quota-fakes.ts` (`assetQuotaOver`, `StorageUsageFake`, `AssetSweepDaoFake`, `FlakyRemovalStorageFake`) e `storage-deletions-fakes.ts` (`StorageDeletionQueueFake`, a fila em memória; `StagedDeletionQueueFake`, a fila vista por uma transação, com `around` que faz commit ou rollback; `DeletionLogFake`); `CampaignRemovalFake` em `campaign-settings-fakes.ts` (`failDeleteWith` faz o `DELETE` lançar).
- Integração: `assets-plan-limit.spec.ts` (8000 px → 4096 no Grátis, 8000 no Narrador, 403 `storage`, uso com e sem referência, isolamento), `storage-deletions.spec.ts` (rollback sem linha, chave repetida vira uma, `due` pelo horário e limite, `drain` no S3 real) e `asset-sweep.spec.ts` (25 h sai e a chave vai à fila, 23 h fica, fundo de grid fica, falha do `remove` deixa a chave na fila, trava, exclusão da mesa enfileira e o `drain` remove no S3 real, e a lista de colunas igual às FKs do `pg_constraint`: tabela nova com FK para `assets` deixa o spec vermelho até entrar no `ASSET_FOREIGN_KEYS`).
- Órfãos do bucket (`pnpm db:remove-orphan-objects`, ver `../server/scripts.md`): unit `orphan-objects.bo.spec.ts` (sem linha nem fila, fora de `assets/`, 24 h) e `orphan-objects.service.spec.ts` (`--dry-run`, `--yes`, lotes, recusas; `AssetStorageFake.storedAt` data o `put`, `AssetRowKeysFake` em `orphan-objects-fakes.ts`); integração `remove-orphan-objects.spec.ts` (bucket próprio, Postgres e S3 reais) e o `listKeys` paginado em `s3-asset-storage.spec.ts`.
- Spec de integração que envia mapa ou fundo acima de 4096/2048 px, ou guarda mais de 100 MB, põe o dono num plano acima do Grátis (`setAccountPlan`).
