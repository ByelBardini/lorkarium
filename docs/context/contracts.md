# Contracts

DTOs em Zod 4 do que atravessa client ↔ server (corpo HTTP, resposta, payload Socket.IO). Vive em `packages/contracts/src/`, exportado por `@lorkarium/contracts` (`src/index.ts` reexporta tudo). Única dependência: `zod`.

## Estrutura

- `src/auth/` — login e usuário autenticado
- `src/http/` — formas transversais da API HTTP (erro)
- `src/campaigns/` — mesa (campanha): resumo, detalhe, criação e entrada por código
- `test/<área>/` — specs só de DTO com regra própria (`transform`, `pipe`, `refine`)

## DTOs

- `loginRequestDto` (`auth/login.dto.ts`) — corpo de `POST /api/auth/login`: `{ email, password, rememberMe }`. E-mail com `trim` + minúsculas antes de validar; senha de 1 a `PASSWORD_MAX_LENGTH` (256); `rememberMe` padrão `false`. Tipos: `LoginRequestDto` (saída) e `LoginRequestInput` (entrada, `rememberMe` opcional).
- `userRoleDto` / `UserRoleDto` (`auth/auth-user.dto.ts`) — papel **global** da conta: `'user' | 'admin'`. Mestre/jogador/espectador não são papel de conta (são por campanha).
- `authUserDto` / `AuthUserDto` — `{ id (uuid), name, email, role }`; nunca leva hash de senha.
- `loginResponseDto` — `{ user: AuthUserDto }`.
- `meResponseDto` — `{ user: AuthUserDto | null }` (`null` = visitante anônimo).
- `apiErrorDto` / `ApiErrorDto` (`http/api-error.dto.ts`) — corpo de todo erro da API: `{ code, message, retryAfterSeconds? }`.
- `healthResponseDto` / `HealthResponseDto` (`http/health.dto.ts`) — corpo do 200 de `GET /api/health`: `{ status: 'ok' }`.

### Mesas (`campaigns/`)

- `campaignRoleDto` (`'master' | 'player'`, papel **por mesa**) e `campaignVisibilityDto` (`'public' | 'private'`) em `campaign.dto.ts`.
- `campaignSummaryDto` — linha da lista: `{ id, name, system | null, status | null, description | null, visibility, myRole, masterName, memberCount, lastEnteredAt (ISO | null) }`.
- `campaignDetailDto` — resumo + `members: { name, role }[]` + `joinCode | null` (só o mestre recebe) + `hasPassword`. Nunca leva senha nem hash.
- `listCampaignsResponseDto` `{ campaigns }`, `campaignResponseDto` `{ campaign: detalhe }`, `campaignIdParamsDto` `{ campaignId: uuid }`.
- `createCampaignRequestDto` (`create-campaign.dto.ts`) — corpo de `POST /api/campaigns`: `name` aparado, 1 a `CAMPAIGN_NAME_MAX_LENGTH` (80); `system`/`status` até `CAMPAIGN_LABEL_MAX_LENGTH` (40) e `description` até `CAMPAIGN_DESCRIPTION_MAX_LENGTH` (500), aparados, vazio/só espaço/ausente → `null`; `visibility` padrão `private`; `password` opcional de `CAMPAIGN_PASSWORD_MIN_LENGTH` (4) a `CAMPAIGN_PASSWORD_MAX_LENGTH` (128), `''` vale como ausente. Tipos `CreateCampaignRequestDto` (saída) e `CreateCampaignRequestInput` (entrada).
- `join-campaign.dto.ts` — `CAMPAIGN_CODE_ALPHABET` (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, sem 0/O/1/I) e `CAMPAIGN_CODE_LENGTH` (8); `campaignCodeDto` tira espaços e hífens e põe em caixa alta antes de validar (`' vhrn-7k2q '` → `'VHRN7K2Q'`); `joinCampaignRequestDto` `{ code, password? }` (senha de 1 a 128: a regra de tamanho mínimo é da criação); `joinCampaignResponseDto` `{ campaign: resumo }`.

## Regras de arquitetura

- Todo objeto é `z.strictObject`: campo extra é recusado (um `role` ou `userId` forjado no corpo não passa).
- O mesmo DTO valida nas duas pontas: o server na borda, o client antes de enviar e ao ler a resposta. Regra de formulário não é reescrita no client.
- Só ganha spec o DTO com regra própria (`transform`, `pipe`, `refine`, limite que é decisão do projeto); `z.string()` puro não se testa.

## Armadilhas

- `z.string().trim().toLowerCase().pipe(z.email())`: a normalização vem **antes** do `pipe`; com `z.email()` direto, `' Ana@x.com'` é recusado em vez de normalizado.
