# Contratos dos planos (`packages/contracts/src/plans/`)

A regra efetiva (admin, Dono, Apoiador) e onde cada limite é checado: [`../plans.md`](../plans.md).

## Nomes (`user-plan.dto.ts`)

- `USER_PLANS = ['free', 'apoiador', 'narrador', 'lenda', 'amigo_do_dono']`, do mais barato ao `amigo_do_dono` (uma conta tem um só): é a ordem que o client percorre para achar o plano que libera um limite (a frase nunca oferece o Apoiador nem o Amigo do Dono). `userPlanDto` (a recusa cita o valor e a lista) / `UserPlan`.
- `PLAN_COUNT_RESOURCES` (`PlanCountResource`) — tetos de contagem: `campaigns`, `storage`, `players`, `masters`, `spectators`, `scenes`, `libraryMaps`, `sheetTemplates`, `npcSheets`, `documentTabs`, `lights`, `tokenBars`, `tokenForms`, `patrols`, `sightBlockers`, `savedRolls`, `savedRollFolders`.
- `PLAN_FEATURE_RESOURCES` (`PlanFeatureResource`) — recursos que o plano tem ou não: `sceneCopy`, `conditionImage`, `auraKind`, `desktopWindows`, `customColor` (conteúdo da mesa e, pelo `customizationAllowed`, a cor da conta), `diceTexture`, `animatedAvatar`.
- `PLAN_LIMIT_RESOURCES` = as duas listas; `planLimitResourceDto` / `PlanLimitResource`.
- `planLimitDto` / `PlanLimitDto` — `{ resource, limit (inteiro ≥ 0; 0 = recurso ausente), plan }`; `PLAN_LIMIT_CODE = 'PLAN_LIMIT'`.
- `apiErrorDto.planLimit?` (`http/api-error.dto.ts`) é esse `planLimitDto`: chega no corpo HTTP (403) e no ack do Socket.IO.

## A grade (`plan-limits.ts`)

`planLimitsDto` / `PlanLimits` — os limites já resolvidos que o server manda ao client (`plan` é o da grade aplicada). `null` = sem teto de plano. `AURA_KINDS = ['color', 'effect', 'image']`. Armazenamento em base 1024 (MiB/GiB).

| Chave                                                          | free (= apoiador) | narrador | lenda  | amigo_do_dono (= técnico)               |
| -------------------------------------------------------------- | ----------------- | -------- | ------ | --------------------------------------- |
| `maxCampaigns`                                                 | 1                 | 5        | 10     | null                                    |
| `maxStorageBytes`                                              | 100 MiB           | 2 GiB    | 10 GiB | null                                    |
| `maxPlayers`                                                   | 6                 | 10       | 20     | null                                    |
| `maxMasters`                                                   | 1                 | 2        | 5      | null                                    |
| `maxSpectators`                                                | 2                 | 10       | 50     | null                                    |
| `maxScenes`                                                    | 5                 | 20       | 500 †  | null                                    |
| `maxLibraryMaps`                                               | 1                 | 5        | 100 †  | null                                    |
| `maxSheetTemplates`                                            | 1                 | 5        | 50 †   | null                                    |
| `maxNpcSheets`                                                 | 10                | 50       | 1000 † | null                                    |
| `maxDocumentTabs`                                              | 5                 | 30       | 200    | `DOCUMENT_TABS_MAX` 200                 |
| `maxLights`                                                    | 15                | 50       | 100    | `LIGHTS_PER_SCENE_MAX` 100              |
| `maxBarsPerToken`                                              | 2                 | 8        | 8      | `MAX_BARS_PER_TOKEN` 8                  |
| `maxFormsPerToken`                                             | 2                 | 8        | 8      | `TOKEN_FORMS_MAX` 8                     |
| `maxPatrols`                                                   | 0                 | 5        | 30     | `TOKEN_PATROLS_RUNNING_MAX` 30          |
| `maxSightBlockers`                                             | 0                 | 10       | 50     | `TOKEN_SIGHT_BLOCKERS_PER_SCENE_MAX` 50 |
| `maxSavedRolls`                                                | 5                 | 20       | 50     | `SAVED_ROLLS_MAX` 50                    |
| `maxSavedRollFolders`                                          | 0                 | 50       | 50     | `SAVED_ROLL_FOLDERS_MAX` 50             |
| `maxDiceModelsPerRoll`                                         | 10                | 20       | 20     | `DICE_THROW_MODELS_MAX` 20              |
| `maxMapSide`                                                   | 4096              | 8192     | 8192   | `ASSET_MAX_SIDE.library_map` 8192       |
| `maxBackgroundSide`                                            | 2048              | 4096     | 4096   | `ASSET_MAX_SIDE.background` 4096        |
| `auraKinds`                                                    | color             | todas    | todas  | todas                                   |
| `sceneCopy`, `conditionImage`, `desktopWindows`, `customColor` | não               | sim      | sim    | sim                                     |

Os tetos de contagem por mesa (`maxPlayers` … `maxNpcSheets`, `maxLights`, `maxPatrols`, `maxSightBlockers`) são por mesa, cena ou grid conforme o recurso; `maxSavedRolls`/`maxSavedRollFolders` por membro; `maxDocumentTabs` por documento; barras e formas por token.

- `PLAN_LIMITS: Record<UserPlan, PlanLimits>` — a grade crua (sem papel; `apoiador` = os números do `free` com `plan: 'apoiador'`); o client lê só para mostrar o que cada plano oferece.
- `PLAN_COUNT_LIMIT_KEY: Record<PlanCountResource, keyof PlanLimits>` — a chave conferida por recurso (`scenes` → `maxScenes`, `tokenBars` → `maxBarsPerToken`…).
- `PLAN_FAIR_USE_RESOURCES: Record<UserPlan, PlanCountResource[]>` — † "uso justo": só a Lenda (`scenes`, `libraryMaps`, `sheetTemplates`, `npcSheets`); a página mostra "ilimitado".
- Spec: `packages/contracts/test/plans/plan-limits.spec.ts` (toda chave em todo plano, a ordem Grátis ≤ Narrador ≤ Lenda, o `amigo_do_dono` igual às constantes técnicas).

## `accountPlanDto` (`plans/account-plan.dto.ts`)

- `accountPlanDto` / `AccountPlanDto` — resposta de `GET /api/account/plan`: `{ plan, limits (planLimitsDto, efetivos), customization (boolean), usage: accountPlanUsageDto }`.
- `accountPlanUsageDto` / `AccountPlanUsageDto` — `{ campaignsOwned, storageBytes }` (inteiros ≥ 0; `storageBytes` soma os arquivos das mesas de que a conta é dona, ver [`../assets/cota-e-varredura.md`](../assets/cota-e-varredura.md)).
- O mesmo `plan`, `limits` e `customization` vão no `authUserDto` (`/me`); o `profileDto` leva só o `plan`, com `admin` e `lorkariumOwner`.

## Os campos do selo

Não há plano "Dono": o **Dono do Lorkarium** é a conta do `OWNER_USERNAME` do server (limites do `amigo_do_dono`, como o admin). `lorkariumOwner: boolean` vai no `authUserDto`, no `adminUserDto`, no `profileDto`, no `sessionMemberDto` e no `campaignMemberDto`; os três últimos levam também `admin: boolean` (papel global; os dois primeiros já têm `role`) e o plano **gravado**. O client escolhe um selo só a partir deles ([`../plans/selos.md`](../plans/selos.md)).
