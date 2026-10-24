# Server

API Fastify 5 em `server/` (Node 22, ESM, `tsx`). Este hub cobre o **encanamento** transversal (env, banco, migrações, montagem do app, testes); cada módulo de feature tem o seu doc (`docs/context/<módulo>.md`). As camadas por sufixo estão no `AGENTS.md` e na skill `desenvolver-server`.

## Estrutura

- `src/index.ts` — entrada: `readEnv(process.env)` → `createDatabase` → `buildApp` → `listen`; fecha o pool no `onClose` e em SIGINT/SIGTERM
- `src/config/env.ts` — schema Zod do env (`readEnv`, tipos `Env`, `AdminSeedConfig`, `InvalidEnvError`)
- `src/dev-seed.ts` — segunda raiz de composição (`pnpm db:seed-dev`): `readEnv(readProcessEnv())` → `createDatabase` → `DevPlayersSeedService` → saída em texto puro → `close` (ver `auth.md`, Seed de desenvolvimento)
- `src/stress-seed.ts` — terceira raiz (`pnpm db:seed-stress`): `readEnv(readProcessEnv())` → `createDatabase` → `buildStressSceneSeed(db)` (`src/app/build-stress-seed.ts`: os módulos reais de mesas, cena, paredes, luzes e tokens com um publicador mudo, um `Proxy` que engole todo evento) → `StressSceneSeedService.seed(nodeEnv)` → o caminho da mesa em texto puro (ver Scripts)
- `src/encrypt-emails.ts` — quarta raiz (`pnpm db:encrypt-emails`, ver Scripts)
- `src/mail-preview.ts` — quinta raiz (`pnpm mail:preview`): um exemplar de cada e-mail no Mailpit (ver [`mail.md`](mail.md))
- `src/config/process-env.ts` — `readProcessEnv()`: o `process.env` cru para uma raiz que não é o `index.ts`
- `src/config/drizzle-kit-env.ts` — `readDrizzleKitCredentials()`: o `DATABASE_URL` para o `drizzle-kit` (carrega `server/.env` se existir)
- `src/database/database.ts` — `createDatabase(url, { poolMax?, statementTimeoutMs?, lockTimeoutMs?, queryLog? })` → `{ db, close }` (Drizzle sobre `pg.Pool`; opção ausente = padrão do `pg`: 10 conexões, sem tempo); tipo `Database`; `QueryLog` (`logQuery(sql, params)`, a forma do `logger` do Drizzle) ouve cada comando SQL — só os testes de integração passam um (ver Desempenho)
- `src/database/schema.ts` — reexporta toda tabela (PO); é o `schema` do `drizzle-kit` e do cliente
- `src/database/transaction.ts` — `runInTransaction(db, (tx) => …)`: confirma se o callback resolve, desfaz e relança o mesmo erro se ele lança; `runInSnapshot(db, (tx) => …)`: o mesmo numa transação `repeatable read`, `read only` (escrita nela falha com `25006`), para um retrato feito de muitas leituras (o `board:sync`); tipos `Transaction` e `DatabaseExecutor` (`Database | Transaction`), que é o que o construtor de DAO novo aceita
- `src/database/migrate.ts` — `runMigrations(db)` aplica `server/drizzle/` (usado pelos testes de integração); `runMigrationsThrough(db, tag)` aplica só até `tag`, inclusive (por `migrationsFolderThrough(tag)`, que o `migrationsUpTo` dos specs também usa), porque o migrador roda as pendentes numa transação só
- `src/database/update-many.ts` — `updateManySql({ table, key, columns: { column, cast }[], rows, where, alsoSet? })`: **um** `UPDATE … FROM (VALUES …) AS batch(…)` para um grupo (os DAO de tokens, paredes e desenhos), cada valor com o `cast` do tipo da coluna e o `where` da cena
- `src/database/cells-numeric.ts` — `cellsHundredth(valor)` e `cellsNumeric(valor)` (`'3.33'`): casas ao centésimo como uma coluna `numeric(…, 2)` guarda (usado pelos mappers de tokens e luzes; walls, drawings e effect-areas ainda têm cópia própria)
- `src/database/copy-rows.ts` — `copyRowsSql(tabela, trocadas, origem)` (`INSERT … SELECT` que copia toda coluna como está, troca as dadas e pula identity/gerada), `sceneRowsCopySql` (as linhas de uma cena em outra, ids novos, na ordem) e `uuidArray(ids)` (um parâmetro `uuid[]`); usado pelo Duplicar da biblioteca (ver `library.md`)
- `src/lib/mail/` — o molde dos e-mails (`renderMail`, `validityLabel`; ver [`mail.md`](mail.md)); `src/lib/postgres-error.ts` — `postgresFailureOf(erro)`, `isUniqueViolation(erro, constraint?)` (`23505`) e `isForeignKeyViolation` (`23503`): o código sob o `cause` do Drizzle
- `src/lib/invalid-body.ts` — `invalidBodyError(zodError)`: o corpo 400 `INVALID_BODY` que toda borda devolve quando o DTO recusa (cita caminho e regra, nunca o valor)
- `src/app/wire-account-security.ts` — `wireAccountSecurity`: QR e códigos de recuperação, registra o `account-security` e devolve o módulo (`notices`, `recovery`, usados pelo backoffice); `mailerOf(app, env.mailer)` cria o mailer único do app (SMTP fechado no `onClose`, ou o log), que o `buildApp` passa a quem manda e-mail (`AppDependencies.mailer` vence); `src/app/wire-backoffice.ts` — `wireBackoffice`: registra o `account-links` e depois o `user-admin` (que lê os convites dele) ([`user-admin.md`](user-admin.md), [`account-links.md`](account-links.md)); `src/lib/per-user-rate-limit.ts` — limite de rota logada por usuário
- `src/app/build-app.ts` — `buildApp({ env, db, clock?, mailer? })`: Fastify com logger pino (JSON), `@fastify/cookie`; módulos registrados sob o prefixo `/api` (`API_PREFIX`); instancia os adaptadores do auth e decora `app.authGuards` na raiz (guardas para qualquer módulo, ver `auth.md`); `wireRealtime` liga o Socket.IO e o módulo `sessions` (ver `sessions.md`) e devolve, com as saídas do tempo real, o `profileChanged` (o service da sessão) que o módulo `profiles` recebe, registrado depois dele (ver `profiles.md`)
- `src/realtime/` — Socket.IO (seção Tempo real): `realtime-server.ts` (`attachRealtime`), `connection-identity.bo.ts` (`ConnectionIdentityBo`: confia na identidade guardada ou relê), `command-rate.bo.ts` e `command-rate-guard.ts` (o balde por conexão), `campaign-command-queue.ts` (a fila por mesa), `same-origin.ts` (`isSameOrigin`), `rooms.ts` (`campaignRoom(id)` → `campaign:<id>`, `campaignUserRoom`, `campaignMastersRoom`), `realtime-ack.ts` (`answerAck(ack, work, failureOf, onFailure)`: responde o ack com o resultado ou com o `ApiErrorDto`)
- `drizzle.config.ts` — config do `drizzle-kit` (schema → `drizzle/`)
- `drizzle/` — migrações: `0000_auth`, `0001_campaigns`, `0002_scenes` (tabela `scenes`, `campaigns.active_scene_id` e o `INSERT … SELECT` que dá cena às mesas existentes), `0003_tokens`, `0004_conditions` (com a lista inicial para as mesas existentes), `0005_combat`, … `0010_assets` (tabela `assets`, enums `asset_purpose` e `asset_mime_type`) `0011_scene_background` (`scenes.background_asset_id`) e `0012_token_appearance` (imagem, borda, inverter e direção do token); as seguintes estão no doc de cada área (`ls server/drizzle` dá a lista; a `0034_combatants_combat_idx` cria o índice de `combatants.combat_id`, ver `combat.md`). O `db:generate` gera nome aleatório: rode `pnpm exec drizzle-kit generate --name <nome>` dentro de `server/` (sai `00NN_<nome>.sql` com o `tag` certo) ou renomeie o `.sql` e o `tag` no `meta/_journal.json`; o `meta/` gerado não sai no estilo do Prettier (o `format:check` do CI acusa o snapshot e o journal): rode `pnpm exec prettier --write server/drizzle/meta`; SQL de dados vai à mão no fim do arquivo, depois de um `--> statement-breakpoint`
- `vitest.config.ts` / `vitest.integration.config.ts` — projetos `@lorkarium/server` (unit) e `@lorkarium/server-integration`

## Env (`server/.env.example`)

| Variável                        | Regra                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | `development` (padrão) · `test` (logger mudo) · `production`                            |
| `PORT` / `HOST`                 | padrão `3333` / `0.0.0.0`                                                               |
| `DATABASE_URL`                  | obrigatório                                                                             |
| `DATABASE_POOL_MAX`             | inteiro de 1 a 100, padrão `10` (conexões do `pg.Pool`)                                 |
| `DATABASE_STATEMENT_TIMEOUT_MS` | 100 a 600000, padrão `5000`: comando mais longo é cancelado pelo Postgres               |
| `DATABASE_LOCK_TIMEOUT_MS`      | 100 a 600000, padrão `2000`: esperar trava (a da cena) além disso falha com `55P03`     |
| `ADMIN_EMAIL`                   | opcional; só junto com `ADMIN_PASSWORD`; normalizado                                    |
| `ADMIN_PASSWORD`                | opcional; só junto com `ADMIN_EMAIL`; mínimo 12 caracteres só com `NODE_ENV=production` |
| `S3_ENDPOINT`                   | obrigatório; URL do S3 (`http://localhost:8333`, o SeaweedFS do `pnpm db:up`)           |
| `S3_REGION`                     | padrão `us-east-1`                                                                      |
| `S3_BUCKET`                     | obrigatório; criado no boot se faltar (ver `assets.md`)                                 |
| `S3_ACCESS_KEY_ID`              | obrigatório                                                                             |
| `S3_SECRET_ACCESS_KEY`          | obrigatório, mínimo 8 caracteres; redigido no erro                                      |
| `S3_FORCE_PATH_STYLE`           | `true` (padrão) ou `false`; SeaweedFS e MinIO pedem `true`                              |
| `DATA_ENCRYPTION_KEY`           | obrigatória; 32 bytes em base64 (`openssl rand -base64 32`); redigida no erro           |
| `SMTP_URL`                      | `smtp://` ou `smtps://`; **obrigatória em produção**; vazia = `LogMailer`; redigida     |
| `MAIL_FROM`                     | padrão `Lorkarium <no-reply@lorkarium.dev>` (o remetente de todo e-mail)                |
| `APP_PUBLIC_URL`                | base dos links dos e-mails; padrão `http://localhost:5173`; obrigatória em produção     |

`KEY=` vazio vale como ausente. O erro de boot cita cada variável e o valor recebido, mas redige `DATABASE_URL`, `ADMIN_PASSWORD`, `S3_SECRET_ACCESS_KEY`, `DATA_ENCRYPTION_KEY` e `SMTP_URL`. A chave vira `env.dataEncryptionKey` (`Buffer`); a do `.env.example` é **só de dev** e vale também na integração (`vitest.integration.config.ts`), no e2e (`playwright.config.ts`) e no CI. Um `server/.env` antigo precisa dela, ou o boot recusa. O `Env` entrega o banco como `database` (`DatabaseConfig`: `poolMax`, `statementTimeoutMs`, `lockTimeoutMs`), que as três raízes passam a `createDatabase(url, env.database)`; o `pg` manda os dois tempos como configuração de cada conexão nova. Por quê: toda mutação do tabuleiro espera o `FOR UPDATE` da cena segurando uma conexão; sem `lock_timeout` uma cena presa esgotaria o pool de todas as mesas, e o `0` (esperar para sempre) é recusado de propósito. O `55P03` chega à borda como `INTERNAL_ERROR` logado com o código do Postgres em `err.cause.code` (com a fila por mesa a espera pela trava fica rara). O `Env` entrega o e-mail como `mailer` (`MailerConfig`, SMTP ou log) e `appPublicUrl`; no dev o SMTP é o Mailpit do `pnpm db:up` (detalhe por ambiente em [`server/mail.md`](server/mail.md)). O `Env` entrega o S3 como `storage` (`StorageConfig`: `endpoint`, `region`, `bucket`, `accessKeyId`, `secretAccessKey`, `forcePathStyle`). Os scripts `dev`/`start` carregam `server/.env` por `--env-file-if-exists`; variável exportada no shell vence o `.env`.

## Scripts

`db:generate`, `db:migrate`, `db:encrypt-emails`, `db:seed-dev`, `db:seed-stress`, `mail:preview`, o build e os testes: [`server/scripts.md`](server/scripts.md).

## Regras de arquitetura

- `process.env` só em `src/config/` e `src/index.ts` (o driver do `desenvolver-server` cobra). Outra raiz (o `dev-seed.ts`) lê pelo `readProcessEnv()`.
- Quem cria a conexão a fecha: `index.ts` e o suporte de teste chamam `close()`; `buildApp` recebe o `db` pronto e não o fecha.
- O logger redige `req.headers.cookie` e `res.headers["set-cookie"]`; corpo de requisição nunca é logado.
- Transação: quem abre é o **service**, pelo `runInTransaction` (recebido por dependência, para o unit trocá-lo por fake); o DAO só recebe o `tx` no construtor e nunca abre transação.
- Rotas HTTP ficam sob `/api` (o proxy do Vite e a mesma origem em produção dependem disso).

## Tempo real (`src/realtime/`)

- `attachRealtime(app, { authenticate, sessionCookie, clock })` cria `new Server(app.server, { ...realtimeServerOptions(), allowRequest })` (sem `fastify-socket.io`, que não declara Fastify 5), sem `connectionStateRecovery`. `realtimeServerOptions()` (puro): `path: REALTIME_PATH` (`/api/socket.io`), `serveClient: false`, `perMessageDeflate: { threshold: 4096 }` e `maxHttpBufferSize: REALTIME_MESSAGE_MAX_BYTES` (5 MiB), os dois do contracts. Por quê: o deflate custa CPU e memória por conexão, então só vale para o que é grande (o snapshot, colar muitos desenhos), nunca para a prévia de arraste; e o buffer padrão de 1 MB **derrubava a conexão** com um `drawing:createMany` válido de 64 traços grandes (≈ 4,8 MB) — agora o comando é aceito, e um acima do DTO mas abaixo do buffer recebe `INVALID_BODY` em vez de cair. O client abre por websocket direto e cai para polling se falhar (ver `client.md`). Devolve `{ io, onConnection(listener), reauthenticate(socket), endSession(sessionId) }`; o `buildApp` o chama com `auth.guards.authenticateConnection`, `SESSION_COOKIE` e o relógio do app (`AppDependencies.clock`, opcional: o spec de integração passa um `ClockFake` para cruzar o prazo).
- **Handshake:** `io.use` lê o cookie `lk_session` do handshake por `app.parseCookie` e chama `authenticate` (devolve `ConnectionIdentity`: `user`, `sessionId` — o hash do token — e `recheckAt`). Sessão ausente, desconhecida ou encerrada → `connect_error` com `message: 'UNAUTHENTICATED'` (e o `ApiErrorDto` em `data`); falha inesperada → `INTERNAL_ERROR` no log. Tudo fica em `socket.data` (`RealtimeSocketData`: `user`, `token`, `sessionId`, `recheckAt`, `campaignIds` — as mesas da conexão, vazio no handshake); identidade **nunca** vem do payload.
- **Identidade guardada na conexão:** `reauthenticate(socket)` (os gateways chamam a cada comando) **não vai ao banco** antes de `recheckAt` (`ConnectionIdentityBo.checkAt(agora)` → `trust-kept`); dali em diante relê a sessão uma vez (`reread`), o que também renova a expiração deslizante como antes, e guarda o novo `user` e `recheckAt` campo a campo (um gateway pode ter mexido em `campaignIds` no meio). `null` = sessão vencida ou apagada → o gateway responde `UNAUTHENTICATED` e derruba a conexão. `recheckAt` é o instante em que a renovação passa a valer (`AuthSessionBo.recheckAt()`, metade do prazo): antes dele, reler acharia a mesma sessão — a não ser por logout, que derruba o socket sozinho.
- **Fim da sessão:** o `logout` do auth avisa a `SessionEndedPort` (adaptador `SocketIoSessionEnded`, ligado ao `realtime` depois que ele existe, porque o handshake precisa do auth); `endSession(sessionId)` desconecta (`io server disconnect`) só os sockets daquela sessão — outra sessão do mesmo usuário segue. Vale em instância única (spec §5.7); com várias, o aviso vira mensagem entre instâncias.
- **Origem:** `allowRequest` aceita só `Origin` cujo host é igual ao `Host`; sem `Origin` (cliente que não é navegador) passa, mas o cookie continua obrigatório. Sem env var.
- **Fechamento:** `preClose` desconecta os sockets e fecha o engine (`io.close()` fecharia o `app.server`, que o Fastify fecha logo depois).
- **Fila por mesa** (`campaign-command-queue.ts`, `CampaignCommandQueue.run(campaignId, work)`): os comandos do tabuleiro que gravam esperam a vez **em memória**, um por mesa, na ordem de chegada, antes de pegar conexão do pool; mesas diferentes andam em paralelo, a falha de um chega só a quem pediu e o próximo roda, e mesa ociosa não deixa entrada no mapa (`busyTables()`). Por quê: sem ela, cada comando de uma rajada pega uma conexão e fica esperando o `FOR UPDATE` da cena, e o pool acaba para as outras mesas. O `FOR UPDATE` continua como rede de segurança (rotas HTTP, seed). Vale porque o server é **instância única** (spec §5.7): com mais de uma, dois processos teriam filas separadas para a mesma mesa e a ordem voltaria a depender só da trava do banco — aí a fila vira um lock distribuído (Redis) por mesa, ou a mesa passa a ter dono (roteamento por `campaignId`).
- Limite de comandos por conexão (40 de uma vez, 20/s): `command-rate.bo.ts` + `command-rate-guard.ts` em `src/realtime/`, um guarda só para os gateways da sessão e do tabuleiro (ver `board.md`).
- Log por `app.log` com `userId` e `socketId`, nunca com o cookie. Tipos `RealtimeServer`/`RealtimeSocket` com `TableClientEvents`/`TableServerEvents` do contracts (sessão + tabuleiro). O `wireRealtime` liga `sessions` e `board` (este com o `scenes`).

## Testes

- Unit (`test/**`, exceto `test/integration/`): sem banco nem Fastify. Encanamento (`build-app`, `database`, `migrate`) não tem unit: é provado pela integração.
- Integração (`test/integration/**`): `test/support/sign-in.ts` (`signUpAndLogin(app, db, nome)` → `{ id, token }`) e `test/support/realtime-client.ts` (`connectRealtime(url, { token, origin })`, só websocket e sem reconexão; `disconnectionOf(socket)`); o handshake é provado em `realtime.spec.ts` (app em porta efêmera por `app.listen({ port: 0 })`).
- Integração (`test/integration/**`): arquivos em série (um Postgres compartilhado), `hookTimeout` de 30 s. Sempre no Postgres descartável da receita do `/testar` (porta 5434), nunca no do `pnpm db:up`.

## Desempenho

- `test/support/query-count.ts` — `CountingQueryLog` (`queries`, `count`, `matching(/^begin/i)`, `reset()`); o `useTokenTable` o liga por `openTestDatabase({ queryLog })` e o expõe como `live.queries` (zerado a cada `seed`). Para contar um comando: `live.queries.reset()` logo antes de mandá-lo e ler `count` depois do ack. O Drizzle registra também `begin` e `commit`.
- `test/integration/query-budget.spec.ts` — o teto de consultas de cada comando quente (`BUDGET`); uma consulta a mais num DAO deixa o `it` vermelho. Quando um número baixa, o teto desce junto.

| Comando (cenário do spec)                      | Sem memória | Atual | Regras que seguram |
| ---------------------------------------------- | ----------- | ----- | ------------------ |
| `token:dragMany` de jogador (0 `begin`)        | 9           | 1     | 1, 2, 4            |
| `token:move` de jogador numa cena com paredes  | 12          | 9     | 1, 2               |
| o próximo `token:move` do mesmo jogador        | 12          | 8     | 1, 2, 3            |
| `token:createMany` de 64                       | 394         | 9     | 1, 2, 7, 9         |
| `combat:nextTurn` com 4 entradas e 3 condições | 19          | 10    | 1, 2, 8            |
| `board:sync` (com `begin`/`commit` do retrato) | 16          | 15    | 1, 2, 10           |

Os números contam `begin`/`commit`. "Sem memória" é o custo medido antes das regras abaixo.

### Regras de desempenho (não desfazer)

Cada regra diz onde mora e quantas consultas voltam se for quebrada. Mexeu num DAO, num service do tabuleiro ou no encanamento do Socket.IO: rode o `query-budget.spec.ts` antes e depois.

1. **A identidade fica na conexão** (`src/realtime/realtime-server.ts`, `ConnectionIdentityBo`): `reauthenticate` só relê a sessão a partir do `recheckAt`, e o logout derruba os sockets da sessão pela `SessionEndedPort`. Reler a cada comando volta 2 consultas (sessão e usuário) em **todo** comando de mesa, inclusive a prévia de arraste.
2. **Participação em memória, só positiva** (`CachedMemberships`, `modules/campaigns/cached-memberships.ts`): os módulos do tabuleiro recebem o `members` do `campaigns.memberships` pelo plugin (nunca `new CampaignMembersDao(db)` próprio), e o `rosterOf` do `session:join` passa por ela e a aquece. Um DAO próprio num plugin volta 1 consulta por comando daquele módulo; lembrar "não é membro" barra quem entra pelo código logo depois.
3. **Paredes da cena em memória, enchidas só sob a trava e esquecidas ao gravar** (`SceneWallsService`, `modules/walls/scene-walls.service.ts`; ver `walls.md`): o move e a porta de jogador não releem as paredes, e o array devolvido é o mesmo enquanto nada muda (o `preparedWalls` do game-core é reaproveitado). Ler pelo DAO direto volta 1 consulta por move/porta de jogador **e** a preparação das paredes a cada comando; encher fora da trava ou esquecer o `forget` ao gravar = parede velha barrando (ou deixando passar) o token.
4. **`token:dragMany` sem transação, numa consulta** (`TokensDao.findDragGroup`, `TokensService.dragMany`; ver `tokens/arraste.md`): a prévia não grava, então não trava a cena nem segura conexão. Voltar para `transaction` + `findActiveOf` + `findManyInScene` volta 5 consultas (`begin`, cena, tokens, barras, controladores, `commit`) por prévia, até 10/s por jogador, e a prévia passa a esperar a trava dos comandos que gravam.
5. **Pool e tempos por env** (`createDatabase(url, env.database)`, `src/config/env.ts`): `lock_timeout` de 2 s e `statement_timeout` de 5 s em toda conexão. Sem eles, uma rajada que segura a trava de uma cena deixa as conexões esperando para sempre e as outras mesas ficam sem pool; não custa consulta, custa a mesa inteira travada.
6. **Fila de comandos por mesa** (`CampaignCommandQueue`, `src/realtime/campaign-command-queue.ts`, aplicada no `write` do `board.gateway.ts`): comando que grava espera a vez fora do pool. Tirar a fila não muda a contagem de consultas, mas com o pool pequeno uma rajada de 20 moves numa mesa faz o `board:sync` de outra mesa responder por último (o `board.spec.ts` prova com `poolMax: 2`); pôr o `token:dragMany` ou o `board:sync` na fila atrasa a prévia atrás das gravações.
7. **Escrita de grupo em lote** (`updateManySql`, `src/database/update-many.ts`; `TokensDao.insertMany`): mover, virar e redimensionar tokens, mover paredes e desenhos são **um** `UPDATE` com `scene_id` no `WHERE`; colar tokens são 2 comandos (tokens; barras + controladores num `WITH`), sem reler condições do token novo. Voltar ao laço por item custa 1 consulta por item no mover (64 num grupo grande) e ~5 por token no colar (o `createMany` de 64 voltava a 391), tudo dentro da trava da cena.
8. **Combate enxuto + índice** (`CombatService`, `TokensDao.controlOfScene`, `ConditionsDao.decrementRemaining`, `combatants_combat_idx`): o comando de combate lê só id e controladores dos tokens (não a cena inteira com barras), o `nextTurn` tica as condições da entrada em lote e o evento da vez sai da linha já lida. Voltar ao `listOfScene` custa 2 consultas por comando de combate (e as barras de todos os tokens), a releitura do combate +3 em cada vez, e o tique por condição +1 por condição da entrada; sem o índice, cada leitura das entradas varre `combatants`.
9. **Teto de 500 tokens por cena** (`TokenRulesBo.admit`, `TOKENS_PER_SCENE_MAX`; ver `tokens.md`, Regra): o `create` e o `createMany` contam a cena dentro da trava (+1 consulta, o `COUNT`, que entra no 9 do `createMany`) e recusam o lote inteiro. Sem ele, uma cena cresce sem limite e o snapshot, o filtro de visão do client e o render passam do orçamento da escala-alvo (300 tokens).
10. **Snapshot numa transação `repeatable read` `read only`** (`runInSnapshot`, `BoardService.snapshotFor`): as ≈13 leituras do `board:sync` veem o mesmo instante (custa o `begin` e o `commit`: 13 → 15). Tirar a transação devolve 2 consultas, mas um comando que grava entre duas leituras volta a entregar um tabuleiro misturado (tokens novos com paredes velhas, versão que não bate).
11. **Socket.IO pelos limites do contracts** (`realtimeServerOptions()`, `REALTIME_MESSAGE_MAX_BYTES`, `REALTIME_COMPRESSION_THRESHOLD_BYTES`; `realtimeClientOptions()` no client): buffer de 5 MiB, compressão a partir de 4 KB e websocket primeiro. Voltar ao buffer de 1 MB derruba a conexão de quem cola 64 desenhos grandes (o `drawings.spec.ts` prova); compressão sem limiar gasta CPU em cada prévia de arraste; polling primeiro custa uma volta HTTP a mais em cada conexão e reconexão. Não custa consulta.

## Armadilhas

- O proxy na frente do server precisa **preservar o `Host`** (`changeOrigin: false` no Vite, que é o padrão; o proxy reverso de produção também): a conexão Socket.IO compara `Origin` com `Host` e recusa se divergirem.

- Enum novo de PO precisa ser exportado também em `src/database/schema.ts` (o arquivo que o `drizzle-kit` lê): sem isso o `db:generate` escreve a coluna com o tipo, mas **sem** o `CREATE TYPE`, e a migração quebra no banco. Confira o SQL gerado antes de seguir.

- `pnpm db:migrate` com o banco fora do ar falha só com `Exit status 1`, sem mensagem: o `drizzle-kit` engole o `ECONNREFUSED`. Confira se `pnpm db:up` subiu o `lorkarium-postgres-1` e se nada mais ocupa a 5432.
- O `drizzle-kit generate` escreve `drizzle/meta/*.json` (e o `_journal.json`) fora do estilo do Prettier: rode `pnpm format` depois de gerar, senão o `format:check` do CI falha.
