# Server: env

O schema Zod do env do server (`server/src/config/env.ts` e os arquivos por área: `github-env.ts`, `sign-up-env.ts`). Hub: [`../server.md`](../server.md).

## Variáveis (`server/.env.example`)

| Variável                                      | Regra                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                    | `development` (padrão) · `test` (logger mudo) · `production`                                                     |
| `PORT` / `HOST`                               | padrão `3333` / `0.0.0.0`                                                                                        |
| `DATABASE_URL`                                | obrigatório                                                                                                      |
| `DATABASE_POOL_MAX`                           | inteiro de 1 a 100, padrão `10` (conexões do `pg.Pool`)                                                          |
| `DATABASE_STATEMENT_TIMEOUT_MS`               | 100 a 600000, padrão `5000`: comando mais longo é cancelado pelo Postgres                                        |
| `DATABASE_LOCK_TIMEOUT_MS`                    | 100 a 600000, padrão `2000`: esperar trava (a da cena) além disso falha com `55P03`                              |
| `ADMIN_EMAIL`                                 | opcional; só junto com `ADMIN_PASSWORD`; normalizado                                                             |
| `ADMIN_PASSWORD`                              | opcional; só junto com `ADMIN_EMAIL`; mínimo 12 caracteres só com `NODE_ENV=production`                          |
| `OWNER_USERNAME`                              | opcional; o @ do Dono do Lorkarium (formato do `usernameDto`); vai em toda conexão do pool                       |
| `S3_ENDPOINT`                                 | obrigatório; URL do S3 (`http://localhost:8333`, o SeaweedFS do `pnpm db:up`)                                    |
| `S3_REGION`                                   | padrão `us-east-1`                                                                                               |
| `S3_BUCKET`                                   | obrigatório; criado no boot se faltar (ver `assets.md`)                                                          |
| `S3_ACCESS_KEY_ID`                            | obrigatório                                                                                                      |
| `S3_SECRET_ACCESS_KEY`                        | obrigatório, mínimo 8 caracteres; redigido no erro                                                               |
| `S3_FORCE_PATH_STYLE`                         | `true` (padrão) ou `false`; SeaweedFS e MinIO pedem `true`                                                       |
| `DATA_ENCRYPTION_KEY`                         | obrigatória; 32 bytes em base64 (`openssl rand -base64 32`); redigida no erro                                    |
| `SMTP_URL`                                    | `smtp://` ou `smtps://`; **obrigatória em produção**; vazia = `LogMailer`; redigida                              |
| `MAIL_FROM`                                   | padrão `Lorkarium <no-reply@lorkarium.dev>` (o remetente de todo e-mail)                                         |
| `MAIL_REPLY_TO`                               | opcional; o contato no Reply-To da medida e do comunicado (`env.mailReplyTo`)                                    |
| `APP_PUBLIC_URL`                              | base dos links dos e-mails; padrão `http://localhost:5173`; obrigatória em produção                              |
| `SITE_PUBLIC_URL`                             | destino do `/api/legal/*`; padrão `http://localhost:4321`; obrigatória em produção                               |
| `TRUST_PROXY`                                 | saltos de proxy confiáveis, 0 a 5, padrão `0`; `1` atrás do Traefik do Coolify                                   |
| `CLIENT_DIST_DIR`                             | opcional, caminho absoluto do `vite build`; o server serve a SPA (a imagem já o define)                          |
| `ASSET_CACHE_DIR`                             | opcional, absoluto; cache em disco dos objetos do S3; vazio = lê direto do S3 (dev, CI)                          |
| `ASSET_CACHE_MAX_MB`                          | inteiro de 1 a 1048576, padrão `10240` (o teto do cache); só com `ASSET_CACHE_DIR`                               |
| `ACCESS_LOG_S3_*`                             | `_BUCKET`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY`: obrigatórias em produção (`access-log.md`)                    |
| `GITHUB_APP_*`                                | `_ID`, `_INSTALLATION_ID`, `_PRIVATE_KEY` (PEM, redigida): as três ou nenhuma (`feedback.md`)                    |
| `GITHUB_ISSUES_REPOSITORY`                    | `owner/nome` onde os relatos viram issue; padrão `ByelBardini/lorkarium`                                         |
| `REGISTRATION_OPEN`                           | `true` ou `false` (padrão `false`; outro valor recusa citando-o): o cadastro público (`account-links.md`)        |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | as duas juntas; **obrigatórias em produção**; fora dela, sem as duas = `SkippedHumanCheck`; a secreta é redigida |
| `SENTRY_DSN`                                  | opcional; `https://<chave>@<host>/<projeto>` (`http` só fora da produção); vazio = nada vai ao Sentry; público   |
| `SENTRY_ENVIRONMENT`                          | opcional, padrão = `NODE_ENV`; só com o `SENTRY_DSN`                                                             |
| `SENTRY_RELEASE`                              | opcional, o commit do deploy; só com o `SENTRY_DSN`                                                              |

O `TRUST_PROXY` vira `env.trustProxyHops` e o `buildApp` o passa ao Fastify por `trustProxyOf(hops)` (`src/app/trust-proxy.ts`): uma **função** `(endereço, salto) => salto < hops`, porque desde o 5.12 o Fastify trata `trustProxy` numérico como "não confia em nada". Por quê: o rate limit do login é por `request.ip`; com `0` atrás de um proxy todo mundo cai no IP dele, e `true` aceitaria qualquer `X-Forwarded-For` forjado. A contagem de saltos não distingue o proxy de quem fala direto com a porta, então em produção a porta só pode ser alcançável pelo proxy (ver [`deploy.md`](../deploy.md)). `KEY=` vazio vale como ausente. O erro de boot cita cada variável e o valor recebido, mas redige `DATABASE_URL`, `ADMIN_PASSWORD`, `S3_SECRET_ACCESS_KEY`, `DATA_ENCRYPTION_KEY`, `SMTP_URL`, `GITHUB_APP_PRIVATE_KEY` e `TURNSTILE_SECRET_KEY`. A chave vira `env.dataEncryptionKey` (`Buffer`); a do `.env.example` é **só de dev** e vale também na integração (`vitest.integration.config.ts`), no e2e (`playwright.config.ts`) e no CI. Um `server/.env` antigo precisa dela, ou o boot recusa. O `Env` entrega o banco como `database` (`DatabaseConfig`: `poolMax`, `statementTimeoutMs`, `lockTimeoutMs`), que as três raízes passam a `createDatabase(url, env.database)`; o `pg` manda os dois tempos como configuração de cada conexão nova. Por quê: toda mutação do tabuleiro espera o `FOR UPDATE` da cena segurando uma conexão; sem `lock_timeout` uma cena presa esgotaria o pool de todas as mesas, e o `0` (esperar para sempre) é recusado de propósito. O `55P03` chega à borda como `INTERNAL_ERROR` logado com o código do Postgres em `err.cause.code` (com a fila por mesa a espera pela trava fica rara). O `Env` entrega o e-mail como `mailer` (`MailerConfig`, SMTP ou log) e `appPublicUrl`; no dev o SMTP é o Mailpit do `pnpm db:up` (detalhe por ambiente em [`mail.md`](mail.md)). O `Env` entrega o S3 como `storage` (`StorageConfig`: `endpoint`, `region`, `bucket`, `accessKeyId`, `secretAccessKey`, `forcePathStyle`), o registro de acesso como `accessLog` (`StorageConfig | null`) e o cache em disco dos assets como `assetCache` (`AssetCacheConfig | null`: `dir`, `maxBytes` em bytes). Os scripts `dev`/`start` carregam `server/.env` por `--env-file-if-exists`; variável exportada no shell vence o `.env`.

O cadastro público vem de `src/config/sign-up-env.ts` (`signUpEnvShape`, `requireTurnstilePair`, `toSignUpConfig`) e chega como `env.signUp` (`SignUpConfig`: `registrationOpen`, `humanCheck: { siteKey, secretKey } | null`). As chaves andam juntas porque o "esqueci a senha" usa o Turnstile sempre, até com o cadastro fechado. O CI sobe a imagem de produção com o par de teste da Cloudflare (`1x00000000000000000000AA` / `1x0000000000000000000000000000000AA`).

A captura de erros vem de `src/config/error-reporting-env.ts` (`errorReportingEnvShape`, `requireDsnForErrorReporting`, `toErrorReportingConfig`) e chega como `env.errorReporting` (`ErrorReportingConfig`: `dsn`, `environment`, `release`, ou `null` sem DSN). O DSN não é redigido no erro de boot: ele é público por desenho (vai ao client). `SENTRY_ENVIRONMENT` ou `SENTRY_RELEASE` sem o DSN recusa o boot, porque é um DSN esquecido. O `env.ts` está no teto de 500 linhas: variável nova entra num `*-env.ts` próprio, como esta. Uso em [`error-reports.md`](../error-reports.md).
