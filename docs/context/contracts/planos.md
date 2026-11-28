# Contratos dos planos (`packages/contracts/src/plans/`)

A regra efetiva (admin, Dono, Apoiador) e onde cada limite é checado: [`../plans.md`](../plans.md).

## Nomes (`user-plan.dto.ts`)

- `USER_PLANS = ['free', 'apoiador', 'narrador', 'lenda', 'amigo_do_dono']`, do mais barato ao `amigo_do_dono` (uma conta tem um só): é a ordem que o client percorre para achar o plano que libera um limite (a frase nunca oferece o Apoiador nem o Amigo do Dono). `userPlanDto` (a recusa cita o valor e a lista) / `UserPlan`.
- `PLAN_COUNT_RESOURCES` (`PlanCountResource`) — tetos de contagem: `campaigns`, `storage`, `players`, `masters`, `spectators`, `scenes`, `libraryMaps`, `sheetTemplates`, `npcSheets`, `documentTabs`, `lights`, `tokenBars`, `tokenForms`, `patrols`, `sightBlockers`, `savedRolls`, `savedRollFolders`.
- `PLAN_FEATURE_RESOURCES` (`PlanFeatureResource`) — recursos que o plano tem ou não: `sceneCopy`, `conditionImage`, `auraKind`, `desktopWindows`, `customColor` (conteúdo da mesa e, pelo `customizationAllowed`, a cor da conta), `diceTexture`, `animatedAvatar`, `profileBanner` (o banner 3:1 do perfil), `campaignArt` (Capa e Banner com imagem própria) , `privateCampaign` (mesa privada), `animatedCampaignArt` (a foto, a Capa e o Banner da mesa em GIF animado; sem ela o GIF fica no 1º quadro) `sheetScripts` (os `.js` do modelo de ficha rodam; sem ela a ficha abre só com HTML, CSS e `data-lk`) `magicSight` (o token com visão mágica) e `roundCyclePhaseImage` (a fase do ciclo com imagem própria; sem ela, só o ícone). São chaves booleanas da grade com o mesmo nome do recurso: `campaignArt` (Capa e Banner parados), `privateCampaign`, `sheetScripts`, `magicSight` e `roundCyclePhaseImage` abrem do Narrador para cima; `desktopWindows`, `animatedCampaignArt`, `profileBanner` e a aura com efeito ou imagem só na Lenda.
- `PLAN_LIMIT_RESOURCES` = as duas listas; `planLimitResourceDto` / `PlanLimitResource`.
- `planLimitDto` / `PlanLimitDto` — `{ resource, limit (inteiro ≥ 0; 0 = recurso ausente), plan, reason?, holder? }`; `reason` de `PLAN_LIMIT_REASONS` = `room` (criar passa do teto; ausente vale `room`) ou `readOnly` (editar um item mantido além do teto depois da queda de plano); `holder` de `PLAN_LIMIT_HOLDERS` = `account` (o teto veio do plano da própria pessoa) ou `table` (do dono da mesa), hoje só nas rolagens salvas e pastas; ausente = o que o recurso diz por padrão. Valor fora da lista → `holder "team": expected one of account, table`. `PLAN_LIMIT_CODE = 'PLAN_LIMIT'`.
- `apiErrorDto.planLimit?` (`http/api-error.dto.ts`) é esse `planLimitDto`: chega no corpo HTTP (403) e no ack do Socket.IO.
- `planLocked: boolean` (obrigatório): o item passou do teto do plano do dono pela ordem de criação no grupo e a configuração dele está só leitura (o `reason: 'readOnly'` antecipado; regra em [`../plans/excedente-so-leitura.md`](../plans/excedente-so-leitura.md)). Vai no `librarySceneDto` e no `sceneDto` da sala (grid), no `libraryMapSummaryDto` e no `libraryMapDetailDto` (mapa), no `sheetTemplateSummaryDto` e no `sheetTemplateDto` (modelo), no `documentTabSummaryDto` e no `documentTabDto` (aba) e no `savedRollDto` (rolagem salva, também no `sheetFrameSavedRollsDto`). Barras, formas, luzes, patrulhas e bloqueadores não têm: só a recusa diz.

## A grade (`plan-limits.ts`)

`planLimitsDto` / `PlanLimits` — os limites já resolvidos que o server manda ao client (`plan` é o da grade aplicada). `null` = sem teto de plano. `AURA_KINDS = ['color', 'effect', 'image']`. Armazenamento em base 1024 (MiB/GiB).

| Chave                                                                                                                                | free (= apoiador) | narrador | lenda  | amigo_do_dono (= técnico)               |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | -------- | ------ | --------------------------------------- |
| `maxCampaigns`                                                                                                                       | 1                 | 3        | 10     | null                                    |
| `maxStorageBytes`                                                                                                                    | 100 MiB           | 1 GiB    | 5 GiB  | null                                    |
| `maxPlayers`                                                                                                                         | 5                 | 8        | 20     | null                                    |
| `maxMasters`                                                                                                                         | 1                 | 2        | 5      | null                                    |
| `maxSpectators`                                                                                                                      | 1                 | 5        | 50     | null                                    |
| `maxScenes`                                                                                                                          | 3                 | 15       | 500 †  | null                                    |
| `maxLibraryMaps`                                                                                                                     | 0                 | 3        | 100 †  | null                                    |
| `maxSheetTemplates`                                                                                                                  | 1                 | 3        | 50 †   | null                                    |
| `maxNpcSheets`                                                                                                                       | 5                 | 30       | 1000 † | null                                    |
| `maxDocumentTabs`                                                                                                                    | 3                 | 10       | 200    | `DOCUMENT_TABS_MAX` 200                 |
| `maxLights`                                                                                                                          | 10                | 30       | 100    | `LIGHTS_PER_SCENE_MAX` 100              |
| `maxBarsPerToken`                                                                                                                    | 1                 | 4        | 8      | `MAX_BARS_PER_TOKEN` 8                  |
| `maxFormsPerToken`                                                                                                                   | 2                 | 4        | 8      | `TOKEN_FORMS_MAX` 8                     |
| `maxPatrols`                                                                                                                         | 0                 | 3        | 30     | `TOKEN_PATROLS_RUNNING_MAX` 30          |
| `maxSightBlockers`                                                                                                                   | 0                 | 5        | 50     | `TOKEN_SIGHT_BLOCKERS_PER_SCENE_MAX` 50 |
| `maxSavedRolls`                                                                                                                      | 3                 | 15       | 50     | `SAVED_ROLLS_MAX` 50                    |
| `maxSavedRollFolders`                                                                                                                | 0                 | 5        | 50     | `SAVED_ROLL_FOLDERS_MAX` 50             |
| `maxSavedTokens`                                                                                                                     | 0                 | 20       | 50     | `SAVED_TOKENS_MAX` 50                   |
| `maxSavedTokenFolders`                                                                                                               | 0                 | 5        | 20     | `SAVED_TOKEN_FOLDERS_MAX` 20            |
| `maxRoundCycles`                                                                                                                     | 1                 | 3        | 10     | `ROUND_CYCLE_MAX_PER_TABLE` 20          |
| `maxRoundCyclePhases`                                                                                                                | 3                 | 6        | 12     | `ROUND_CYCLE_PHASES_MAX` 12             |
| `maxDiceModelsPerRoll`                                                                                                               | 8                 | 15       | 20     | `DICE_THROW_MODELS_MAX` 20              |
| `maxMapSide`                                                                                                                         | 4096              | 8192     | 8192   | `ASSET_MAX_SIDE.library_map` 8192       |
| `maxBackgroundSide`                                                                                                                  | 2048              | 4096     | 4096   | `ASSET_MAX_SIDE.background` 4096        |
| `auraKinds`                                                                                                                          | color             | color    | todas  | todas                                   |
| `sceneCopy`, `conditionImage`, `customColor`, `campaignArt`, `privateCampaign`, `sheetScripts`, `magicSight`, `roundCyclePhaseImage` | não               | sim      | sim    | sim                                     |
| `desktopWindows`, `animatedCampaignArt`, `profileBanner`                                                                             | não               | não      | sim    | sim                                     |

Os tetos de contagem por mesa (`maxPlayers` … `maxNpcSheets`, `maxLights`, `maxPatrols`, `maxSightBlockers`) são por mesa, cena ou grid conforme o recurso; `maxSavedRolls`/`maxSavedRollFolders` e `maxSavedTokens`/`maxSavedTokenFolders` por membro (o maior entre a mesa e a pessoa, abaixo); `maxRoundCycles` por mesa e `maxRoundCyclePhases` por ciclo; `maxDocumentTabs` por documento; barras e formas por token. `profileBanner` (o banner 3:1 do perfil) é da conta, mas mora na grade para a frase "no plano Lenda" sair dela.

- `PERSONAL_SAVED_ROLL_LIMITS: Record<UserPlan, SavedRollCeilings>` (`{ maxSavedRolls, maxSavedRollFolders }`): o que cada plano dá a quem o tem em qualquer mesa. É a grade do próprio plano, salvo o Apoiador, que leva os números do Narrador (15 / 5), porque as mesas dele seguem o Grátis.
- `savedRollLimitsOf(table, personalPlan)` → `{ limits, holder }`: o maior entre a grade da mesa e a pessoal (empate fica com a mesa). As outras chaves são as da mesa; `plan` é o da grade que ganhou. Exemplo: `savedRollLimitsOf(PLAN_LIMITS.free, 'apoiador')` → 15 / 5, `plan: 'apoiador'`, `holder: 'account'`; a mesa do Apoiador dá 3 / 0 a quem é Grátis (`holder: 'table'`).
- `PERSONAL_SAVED_TOKEN_LIMITS` (`SavedTokenCeilings`): Grátis 0/0, **Apoiador 5/2** (número próprio, não o do Narrador), Narrador 20/5, Lenda e Amigo do Dono 50/20. `savedTokenLimitsOf(table, personalPlan)` segue a mesma regra. As duas saem de `memberLimitsOf` (privada; a 1ª chave do grupo decide quem ganha e só as chaves do grupo vêm da pessoa: ganhar nas rolagens não mexe nos tokens salvos da mesa). `MemberPlanLimits` = `{ limits, holder }` (`SavedRollLimits` é o mesmo tipo).

- `PLAN_LIMITS: Record<UserPlan, PlanLimits>` — a grade crua (sem papel; `apoiador` = os números do `free` com `plan: 'apoiador'`); o client lê só para mostrar o que cada plano oferece.
- `PLAN_COUNT_LIMIT_KEY: Record<PlanCountResource, keyof PlanLimits>` — a chave conferida por recurso (`scenes` → `maxScenes`, `tokenBars` → `maxBarsPerToken`…).
- `PLAN_FAIR_USE_RESOURCES: Record<UserPlan, PlanCountResource[]>` — † "uso justo": só a Lenda (`scenes`, `libraryMaps`, `sheetTemplates`, `npcSheets`); a página mostra "ilimitado".
- Spec: `packages/contracts/test/plans/plan-limits.spec.ts` (toda chave em todo plano, Grátis < Narrador estrito em toda chave numérica e Narrador < Lenda estrito exceto os lados de imagem, os exclusivos da Lenda, o `amigo_do_dono` igual às constantes técnicas, a grade pessoal e `savedRollLimitsOf`).

## `accountPlanDto` (`plans/account-plan.dto.ts`)

- `accountPlanDto` / `AccountPlanDto` — resposta de `GET /api/account/plan`: `{ plan (o do admin), paidPlan, paidPlanUntil (o pago em vigor; `checkPaidPlanPair`), limits (planLimitsDto, efetivos), customization (boolean), usage: accountPlanUsageDto }`.
- `accountPlanUsageDto` / `AccountPlanUsageDto` — `{ campaignsOwned, storageBytes }` (inteiros ≥ 0; `storageBytes` soma os arquivos das mesas de que a conta é dona, ver [`../assets/cota-e-varredura.md`](../assets/cota-e-varredura.md)).
- O mesmo `plan`, `limits` e `customization` vão no `authUserDto` (`/me`); o `profileDto` leva só o `plan`, com `admin` e `lorkariumOwner`.

## Os campos do selo

Não há plano "Dono": o **Dono do Lorkarium** é a conta do `OWNER_USERNAME` do server (limites do `amigo_do_dono`, como o admin). `lorkariumOwner: boolean` vai no `authUserDto`, no `adminUserDto`, no `profileDto`, no `sessionMemberDto` e no `campaignMemberDto`; os três últimos levam também `admin: boolean` (papel global; os dois primeiros já têm `role`) e o plano **gravado**. O client escolhe um selo só a partir deles ([`../plans/selos.md`](../plans/selos.md)).
