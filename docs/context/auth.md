# Auth

Contas, login por e-mail e senha, sessão por cookie e papel global (`user`/`admin`). Vive em `server/src/modules/auth/` (módulo do server) e `client/src/features/auth/` (tela de login). Os DTOs estão em [`contracts.md`](contracts.md).

## Estrutura

- `server/src/modules/auth/*.port.ts` — portas do módulo (abaixo)
- `server/src/infrastructure/{password-hasher,session-token,clock}/` — um adaptador por porta
- `server/src/modules/auth/auth.plugin.ts` — `createAuthModule({ db, env, hasher, tokens, clock })`: roda o seed do admin, calcula o hash-isca e devolve `{ plugin, guards }`; `buildApp` registra o `plugin` sob `/api`
- `server/src/modules/auth/auth.routes.ts` — borda HTTP (`authRoutes`) e guardas (`createAuthGuards`, `SESSION_COOKIE`)
- `server/src/modules/auth/{users,auth-sessions}.po.ts` — tabelas; `users.dao.ts` (`findByEmail`, `findById`, `insert`) e `auth-sessions.dao.ts` (`insert`, `findById`, `updateExpiry`, `delete`)

## Contrato (prefixo `/api`)

| Rota                    | Entrada           | Saída                                                                       | Erros                                                                                                                                                          |
| ----------------------- | ----------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`  | `loginRequestDto` | 200 `loginResponseDto` + `Set-Cookie: lk_session`                           | 400 `INVALID_BODY` · 401 `INVALID_CREDENTIALS` (mesmo corpo para e-mail inexistente e senha errada) · 429 `RATE_LIMITED` + `Retry-After` + `retryAfterSeconds` |
| `POST /api/auth/logout` | cookie            | 204 + cookie expirado; idempotente                                          | —                                                                                                                                                              |
| `GET /api/auth/me`      | cookie            | 200 `meResponseDto` (`user: null` para anônimo, sessão vencida ou revogada) | —                                                                                                                                                              |

- Cookie `lk_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` só com `NODE_ENV=production`. Persistente leva `Max-Age=2592000` e é reemitido quando a sessão renova; sem "Manter conectado" não tem `Max-Age` (cookie de navegador).
- Limite de login: 5 tentativas por minuto por **IP + e-mail** (`@fastify/rate-limit`, `global: false`, hook `preHandler` para a chave ler o corpo). Conta toda tentativa, certa ou errada.
- Erro sempre como `ApiErrorDto`; a mensagem pública é fixa por código (a interna, que cita o e-mail, só vai para o log).

## Guardas (para os outros módulos)

- `app.authGuards` (decorado na raiz por `buildApp`): `requireAuth` e `requireRole('admin')` são `preHandler`; respondem 401 `UNAUTHENTICATED` / 403 `FORBIDDEN_ROLE` em `ApiErrorDto`. `userOf(request)` devolve o `AuthUserDto` de quem passou pela guarda (lança se nenhuma guarda rodou).
- `authenticateConnection(token?)` → `ResolvedSession | null`: para o handshake do Socket.IO e as releituras da conexão, que não têm request para guardar (`null` = sem sessão válida; erro inesperado relança). A conexão guarda o `sessionId` e o `recheckAt` dele (ver `server.md`, Tempo real).
- Uso: `app.get('/x', { preHandler: app.authGuards.requireAuth }, (request) => service.do(app.authGuards.userOf(request).id))`. A identidade vem daqui, nunca do corpo.
- O papel por campanha (mestre/jogador/espectador) **não** passa por estas guardas: é regra do BO do módulo de campanhas.

## Client

- Rotas, guardas e splash em [`client.md`](client.md) (seção Rotas). Login bem-sucedido: `sessionStore.signedIn(user)` + navegação para o `next` seguro; Sair (no menu do usuário do shell, ver [`client/home.md`](client/home.md)): `POST /api/auth/logout`, `signedOut()`, `/login`.
- `LoginPage` (`features/auth/login-page.tsx`): duas colunas em `lg+` (painel `bg-panel` com `LoginHeroArt`, SVG estático `aria-hidden`, e a manchete como `p` de display); abaixo de `lg`, só o formulário com a `BrandMark` compacta. O `h1` é "Bem-vindo de volta". `<title>Lorkarium · Entrar</title>`. No pé da coluna do formulário, `DeveloperCredit` (`features/auth/developer-credit.tsx`): "Desenvolvido por Evolutiva Sistemas", centralizado, com o símbolo e "Evolutiva Sistemas" como link para https://evolutivasistemas.com.br (nova aba, `noopener noreferrer`) (`src/assets/evolutiva-mark.png`, 96px reduzido de `LOGO BRANCA 2.png` da raiz, `alt=""` porque o texto já nomeia). Só no login: crédito de fornecedor dentro do app logado é ruído.
- Escondidos até existirem: "Esqueceu a senha?", "Entrar com código da mesa", Termos/Privacidade.
- Boot: `GET /api/auth/me` decide `authenticated`/`anonymous` no `sessionStore` (a guarda do client só evita mostrar a tela errada; quem decide é o server).
- Serviço `HttpAuthApi` e store em [`client.md`](client.md); a tela vive em `client/src/features/auth/`.
- `LoginForm` (`features/auth/login-form.tsx`, props `authApi`, `onAuthenticated(user)`): valida pelo `loginRequestDto` (sem regra duplicada), `noValidate`, erro inline com `aria-invalid` + `aria-describedby` e foco no primeiro inválido; envio com botão desabilitado, spinner e "Entrando…" e `aria-busy` no form; recusa em `Alert` (`role="alert"`). `invalid_credentials` mantém o e-mail, limpa a senha e foca nela.
- `PasswordField` (`components/password-field.tsx`, compartilhado com os diálogos de mesa): mostrar/ocultar com nome acessível "Mostrar senha" ↔ "Ocultar senha".
- Mensagens: campo — "Informe seu e-mail.", "Informe um e-mail válido, como voce@exemplo.com.", "Informe sua senha.", "A senha pode ter no máximo 256 caracteres."; recusa — "E-mail ou senha incorretos.", "Muitas tentativas. Tente de novo em N s.", "Sem conexão com o servidor. Confira sua internet e tente de novo.", "Algo deu errado do nosso lado. Tente de novo em instantes."
- Teste: `client/test/support/auth-api-fake.ts` — `AuthApiFake` (`answerLoginWith`, `holdLogin()`, `answerMeWith`, `holdMe()`, `loginCalls`, `logoutCalls`; usuários `ANA` e `ROOT_ADMIN`).

## Tabelas (`server/drizzle/0000_auth.sql`)

- `users`: `id` uuid (`gen_random_uuid()`), `name`, `email` **único** e já minúsculo, `password_hash`, `role` enum `user_role` (`user` padrão · `admin`), `created_at`.
- `auth_sessions`: `id` = SHA-256 hex do token do cookie, `user_id` → `users.id` **on delete cascade** (índice), `expires_at`, `persistent`, `created_at`.

## Regras de negócio (BO + mapper)

- `AuthSessionBo` (`auth-session.bo.ts`): `startedAt(now, persistent)` dá 30 dias (`PERSISTENT_SESSION_MS`) com "Manter conectado" e 12 h (`TRANSIENT_SESSION_MS`) sem; `isExpiredAt(now)` é `now >= expiresAt`; `renewalAt(now)` devolve `now + prazo` quando falta **menos** da metade do prazo, senão `null` (expiração deslizante); `recheckAt()` é `expiresAt − prazo/2`, o instante em que a renovação passa a valer (até ele a conexão Socket.IO não relê a sessão).
- `UserAccessBo.requireRole(required)` (`user-access.bo.ts`): admin ⊇ user (o admin passa em rota de `user`); recusa com `ForbiddenRoleError`.
- `AdminSeedBo.decide(config)` (`admin-seed.bo.ts`): sem config → `skip`; e-mail já existente → `skip` (nunca troca senha nem papel); ausente → `create` com `name: 'Admin'`, `role: 'admin'`.
- `auth.mapper.ts`: `toAuthUserDto` (nunca leva hash nem `createdAt`), `toAuthSessionBo`, `toUserAccessBo`, `toAdminSeedBo`.
- `auth.error.ts`: `AuthError` com `code` `INVALID_CREDENTIALS` | `UNAUTHENTICATED` | `FORBIDDEN_ROLE`; a mensagem cita o valor recebido (e-mail, papel) e **nunca** a senha. A borda traduz o código em status e mensagem pública.

## Services

- `AuthService` (`auth.service.ts`, recebe `AuthServiceDeps`: DAOs, as três portas e o `decoyHash`):
  - `login(dto)`: busca por e-mail → `verify` (contra o `decoyHash` quando o e-mail não existe, para as duas recusas custarem o mesmo tempo) → `InvalidCredentialsError` nos dois casos → grava a sessão com `id = hash(token)` → devolve `{ user, token, expiresAt, persistent }`.
  - `resolveSession(token?)`: sem token, token desconhecido ou usuário sumido → `null`; expirada → apaga a linha e `null`; perto do fim → `updateExpiry` e `renewed: true`. Devolve `{ user, sessionId, expiresAt, recheckAt, persistent, renewed }`.
  - `logout(token?)`: apaga a sessão do token e **depois** avisa a `SessionEndedPort` (`sessionEnded(hash)`): as conexões Socket.IO daquela sessão caem na hora; idempotente. Sem cookie, nada é apagado nem avisado.
- `AuthService.authorize(token?, papel)`: sessão válida com o papel, ou lança `UnauthenticatedError` / `ForbiddenRoleError` (é o que as guardas chamam).
- `AdminSeedService.seed(env.adminSeed)` (`admin-seed.service.ts`): `'created'` (hash da senha + insert) ou `'skipped'`. Roda a cada boot, dentro do `createAuthModule`.
- `DevPlayersSeedService.seed(nodeEnv)` (`dev-players-seed.service.ts`): recusa antes de qualquer consulta em produção; cria só os jogadores de teste que faltam e devolve `{ created, skipped }` (e-mails). Não roda no boot: só pelo `pnpm db:seed-dev`.

## Seed de desenvolvimento

- `pnpm db:seed-dev` (entrada `server/src/dev-seed.ts`) cria **Bia** (`bia@lorkarium.dev`) e **Caio** (`caio@lorkarium.dev`), papel `user`, senha `lorkarium-dev` (`DEV_PLAYERS` e `DEV_PLAYER_PASSWORD` em `dev-players-seed.bo.ts`). Serve para testar a mesa com duas pessoas enquanto o cadastro não existe.
- `DevPlayersSeedBo(nodeEnv)`: `requireAllowed()` lança `DevSeedRefusedError` (`DEV_SEED_REFUSED`, cita o `NODE_ENV`) em `production`; `decide(emailsExistentes)` → `{ create, skipped }`. Conta que já existe nunca é reescrita (nem senha nem papel).
- `DevSeedRefusedError` fica fora do `AuthError`: nunca chega à borda HTTP, então não tem status.

## Portas e adaptadores

| Porta                | Adaptador              | O que faz                                                                                             |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `PasswordHasherPort` | `Argon2PasswordHasher` | `hash`/`verify` em Argon2id, mínimo OWASP: 19 MiB, t=2, p=1 (`@node-rs/argon2`)                       |
| `SessionTokenPort`   | `CryptoSessionToken`   | `generate()`: 32 bytes aleatórios em base64url; `hash(token)`: SHA-256 hex (64 ch)                    |
| `ClockPort`          | `SystemClock`          | `now()`                                                                                               |
| `SessionEndedPort`   | `SocketIoSessionEnded` | `sessionEnded(sessionId)`: derruba as conexões Socket.IO da sessão (`attach(realtime)` no `buildApp`) |

- O relógio é porta para as regras de prazo e renovação serem provadas sem esperar; o token é porta para o teste do service saber qual token saiu e qual hash foi gravado.
- O cookie leva o token; o banco guarda só o `hash(token)`. Vazamento do banco não entrega sessão válida.

## Testes

- Integração: `server/test/integration/auth-dao.spec.ts` (DAOs) e `auth.spec.ts` (borda via `buildApp` + `inject`: cookie, 401/400/429, `/me`, logout revoga, guarda 401/403/200, seed no boot). Um app novo por `describe`: o limitador guarda estado em memória.
- `server/test/support/test-database.ts` — `openTestDatabase()` (conecta no `DATABASE_URL` e migra) e `truncateAllTables(db)`; tabela nova entra no `TRUNCATE` dele.
- `server/test/support/auth-factories.ts` — `newUserPo`, `userPo`, `newAuthSessionPo`, `authSessionPo` (e `ANA_ID`).
- `server/test/support/auth-fakes.ts` — `UsersDaoFake` (`rows`, `inserted`, `lookedUp`: e-mails consultados), `AuthSessionsDaoFake` (`rows` por hash), `PasswordHasherFake` (`hashed:<senha>`, registra `verifications`), `SessionTokenFake` (`token-1`…, hash `sha:<token>`), `SessionEndedFake` (`ended`, `whenEnded`), `ClockFake` (`current`).
- Unit: `server/test/modules/auth/*.spec.ts` (BO, mapper, services).

## Armadilhas

- Em `preHandler` assíncrono que responde (guarda), é `return reply.code(...).send(...)`: sem o `return` o Fastify segue para o handler.
- `errorResponseBuilder` do rate-limit **lança** o que devolve: ele devolve `RateLimitedError`, que o error handler do módulo traduz. O header `Retry-After` já vem posto pela lib.

- A tabela é `auth_sessions`, não `sessions`: o spec §6 reserva `Session` para a sessão multiplayer.
- Erro do Postgres chega embrulhado pelo Drizzle: o código (`23505` = unicidade) está em `error.cause.code`, não em `error.code`.
- `Algorithm` do `@node-rs/argon2` é `const enum`: com `isolatedModules` não dá para importar o valor. O adaptador usa `2` tipado como `Algorithm` (é o Argon2id, e também o padrão da lib).
