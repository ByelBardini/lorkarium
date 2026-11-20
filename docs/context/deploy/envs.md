# Deploy: envs de produção

Hub: [`../deploy.md`](../deploy.md).

## Envs (produção)

Lidas por `server/src/config/env.ts`; a regra completa de cada uma está em [`server/env.md`](../server/env.md). "Obrig." = o boot recusa sem ela em produção; "Na prática" = tem padrão, mas o padrão está errado para esta infra. `KEY=` vazio vale como ausente.

| Variável                          | Produção       | Segredo | Valor / como gerar                                                                                                                 |
| --------------------------------- | -------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                        | já na imagem   | não     | `production` (não sobrescreva)                                                                                                     |
| `PORT`                            | já na imagem   | não     | `3333` (o mesmo do _Ports Exposes_)                                                                                                |
| `HOST`                            | padrão         | não     | `0.0.0.0` (padrão; não mude, ou o Traefik não alcança o container)                                                                 |
| `CLIENT_DIST_DIR`                 | já na imagem   | não     | `/app/client/dist`; sem ela o server não serve a SPA                                                                               |
| `DATABASE_URL`                    | **obrig.**     | **sim** | a _Postgres URL (internal)_ do recurso Database: `postgres://<usuário>:<senha>@<id-do-recurso>:5432/lorkarium`                     |
| `DATABASE_POOL_MAX`               | padrão         | não     | `10`; abaixo do `max_connections` do Postgres (100)                                                                                |
| `DATABASE_STATEMENT_TIMEOUT_MS`   | padrão         | não     | `5000`                                                                                                                             |
| `DATABASE_LOCK_TIMEOUT_MS`        | padrão         | não     | `2000`                                                                                                                             |
| `TRUST_PROXY`                     | **na prática** | não     | `1` atrás do Traefik (nuvem cinza); `2` com a nuvem laranja. Padrão `0` junta todo mundo num balde do rate limit                   |
| `APP_PUBLIC_URL`                  | **obrig.**     | não     | `https://app.example.com`, sem barra final: base dos links dos e-mails                                                             |
| `SITE_PUBLIC_URL`                 | **obrig.**     | não     | `https://example.com`, sem barra final: a landing; Termos e Privacidade do app redirecionam para lá (ver `legal.md`)               |
| `ADMIN_EMAIL`                     | opcional       | não     | e-mail do primeiro admin, criado no boot se não existir (nunca troca senha nem papel depois)                                       |
| `ADMIN_PASSWORD`                  | opcional       | **sim** | 12+ caracteres em produção (`openssl rand -base64 18`); só junto com `ADMIN_EMAIL`                                                 |
| `OWNER_USERNAME`                  | opcional       | não     | o @ (sem o `@`) da conta **Dono do Lorkarium**: sem limite de plano e o selo Dono. Vazio = ninguém                                 |
| `S3_ENDPOINT`                     | **obrig.**     | não     | `https://s3.sa-east-1.amazonaws.com`                                                                                               |
| `S3_REGION`                       | **na prática** | não     | `sa-east-1` (o padrão `us-east-1` assina para a região errada)                                                                     |
| `S3_BUCKET`                       | **obrig.**     | não     | o bucket dos assets, já criado                                                                                                     |
| `S3_ACCESS_KEY_ID`                | **obrig.**     | não     | a chave do `lorkarium-app`                                                                                                         |
| `S3_SECRET_ACCESS_KEY`            | **obrig.**     | **sim** | o segredo da mesma chave (8+ caracteres)                                                                                           |
| `S3_FORCE_PATH_STYLE`             | **na prática** | não     | `false` na AWS (o padrão `true` é para SeaweedFS/MinIO)                                                                            |
| `DATA_ENCRYPTION_KEY`             | **obrig.**     | **sim** | `openssl rand -base64 32` (32 bytes). **Guarde uma cópia fora do servidor**: perdê-la perde os e-mails e o 2FA cifrados            |
| `SMTP_URL`                        | **obrig.**     | **sim** | `smtp://` ou `smtps://` do provedor (seção E-mail); usuário e senha **URL-encoded**                                                |
| `MAIL_FROM`                       | **na prática** | não     | `Lorkarium <no-reply@app.example.com>`, no domínio com SPF/DKIM                                                                    |
| `MAIL_REPLY_TO`                   | **na prática** | não     | o e-mail de contato (o mesmo do "Contato" do site): recebe a contestação de uma medida e a resposta a um comunicado                |
| `ACCESS_LOG_S3_BUCKET`            | **obrig.**     | não     | o bucket dos registros de acesso, já criado com a regra de 184 dias ([`aws.md`](aws.md))                                           |
| `ACCESS_LOG_S3_ACCESS_KEY_ID`     | **obrig.**     | não     | a chave do `lorkarium-access-log` (só `s3:PutObject`); endpoint e região são os do `S3_*`                                          |
| `ACCESS_LOG_S3_SECRET_ACCESS_KEY` | **obrig.**     | **sim** | o segredo da mesma chave (8+ caracteres)                                                                                           |
| `ASSET_CACHE_DIR`                 | já na imagem   | não     | `/var/cache/lorkarium/assets`, onde vai o _Volume Mount_; caminho absoluto, e sem ela o cache em disco fica desligado              |
| `ASSET_CACHE_MAX_MB`              | opcional       | não     | teto do cache em disco; padrão `10240` (10 GB). Deixe folga para o disco do VPS                                                    |
| `GITHUB_APP_ID`                   | opcional       | não     | o _App ID_ da GitHub App dos relatos (seção GitHub App); as três `GITHUB_APP_*` juntas ou nenhuma                                  |
| `GITHUB_APP_INSTALLATION_ID`      | opcional       | não     | o número no fim da URL da instalação (`…/settings/installations/<id>`)                                                             |
| `GITHUB_APP_PRIVATE_KEY`          | opcional       | **sim** | o conteúdo do `.pem` gerado na App; numa linha só, com `\n` no lugar das quebras, também vale                                      |
| `GITHUB_ISSUES_REPOSITORY`        | padrão         | não     | `ByelBardini/lorkarium`                                                                                                            |
| `TURNSTILE_SITE_KEY`              | **obrig.**     | não     | a _Site Key_ do widget do Turnstile no painel da Cloudflare, com o hostname do app; vai ao client pelo `GET /api/sign-up/settings` |
| `TURNSTILE_SECRET_KEY`            | **obrig.**     | **sim** | a _Secret Key_ do mesmo widget; o "esqueci a senha" confere o token com ela mesmo com o cadastro fechado                           |
| `REGISTRATION_OPEN`               | padrão         | não     | `false` (padrão); `true` abre o cadastro público ([`../deploy.md`](../deploy.md), Abrir o cadastro público)                        |

O erro de boot cita cada variável errada e redige os segredos; ele aparece no log do deploy no Coolify.
