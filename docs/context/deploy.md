# Deploy

Runbook de produção: **Coolify** num VPS Linux (Traefik na frente), Postgres 17 como recurso _Database_ do Coolify, assets num bucket **S3 da AWS**, e-mail por SMTP de produção. Do zero ao ar sem abrir código. Spec §8.3, §5.7, §11 Fase 6, §12. Plano: [`docs/plans/2026-10-24-publicacao-coolify.md`](../plans/2026-10-24-publicacao-coolify.md).

| Sub-arquivo                      | O que tem                                                               |
| -------------------------------- | ----------------------------------------------------------------------- |
| [`deploy/aws.md`](deploy/aws.md) | bucket, política IAM em JSON, bucket dos backups, custos, troca pelo R2 |

## A imagem (`Dockerfile` na raiz)

- Multi-estágio em `node:22-bookworm-slim` (glibc: `sharp` e `argon2` têm binário nativo glibc, nada de Alpine). O build gera `client/dist` (Vite) e `server/dist` (`index.mjs` e `deploy-migrate.mjs`, com os `@lorkarium/*` no bundle); o runtime leva só isso, `server/drizzle/` e as dependências de produção do server.
- Runtime: `WORKDIR /app/server`, `ENV NODE_ENV=production CLIENT_DIST_DIR=/app/client/dist PORT=3333`, `USER node`, `EXPOSE 3333`.
- `HEALTHCHECK` por `node -e "fetch('http://127.0.0.1:3333/api/health')…"` (não há `curl` na imagem). É ele que o Coolify usa para trocar o container.
- `CMD sh -c "node dist/deploy-migrate.mjs && exec node dist/index.mjs"`: migra no início do container, depois sobe o server. Migração que falha sai com 1 e o server nem sobe. O `exec` deixa o Node como PID 1, para o SIGTERM do `docker stop` chegar ao `app.close()`.
- Um processo serve tudo: a SPA (com fallback de rota), `/api` e o Socket.IO (`/api/socket.io`) na mesma origem. Nenhuma env de build: o client não lê `VITE_*`.
- O job `docker-image` do CI constrói a imagem e faz o smoke a cada PR (ver [`ci.md`](ci.md)). O smoke é `infra/docker/smoke.sh <container> <url>`: espera o `healthy`, `GET /api/health` 200, `/` e `/campaigns/x` com o `index.html`, e "migrations applied" antes de "Server listening" no log. Local: `docker build -t lorkarium .` e um `docker run` com as envs de dev mais `NODE_ENV=production`, `SMTP_URL` (Mailpit) e `APP_PUBLIC_URL` (imagem ≈ 470 MB; `node_modules` de produção ≈ 110 MB).

## AWS

Detalhe e JSON em [`deploy/aws.md`](deploy/aws.md). Resumo:

1. Bucket privado em `sa-east-1`, _Block Public Access_ ligado, criado à mão antes do primeiro deploy.
2. Usuário IAM `lorkarium-app` com `s3:ListBucket` no bucket e `s3:GetObject`/`PutObject`/`DeleteObject` em `bucket/*`. Nada de `CreateBucket`.
3. Segundo bucket (ou outro prefixo) para os backups do Postgres, com usuário próprio.
4. Créditos do plano Free e tráfego de saída: ler a seção Custos antes de assinar.

## E-mail

- Produção exige `SMTP_URL` (o boot recusa sem ela; nunca cai no `LogMailer`). Escolha um provedor:
  - **Amazon SES** (`sa-east-1`): conta nova fica no _sandbox_ (só manda para endereço verificado); sair dele é **pedido** no console (_Request production access_), com prazo de resposta. As credenciais SMTP são geradas no SES e **não** são a chave IAM do S3. `smtps://<usuário SMTP>:<senha>@email-smtp.sa-east-1.amazonaws.com:465`.
  - **Resend**: `smtps://resend:<API key>@smtp.resend.com:465`.
  - **Brevo**: `smtp://<login>:<chave SMTP>@smtp-relay.brevo.com:587` (STARTTLS).
- Domínio do `MAIL_FROM` verificado no provedor: os registros **SPF** (TXT), **DKIM** (CNAME/TXT que o provedor dá) e um **DMARC** (`_dmarc`, TXT, `v=DMARC1; p=none` no começo). Sem eles o e-mail cai no spam ou é recusado.
- `MAIL_FROM` com o domínio verificado: `Lorkarium <no-reply@mesa.example.com>`. O padrão (`lorkarium.dev`) não é seu.
- Conferência: o Teste de e-mail do backoffice manda pelo mailer real e mostra `MAIL_DELIVERY_FAILED` se o SMTP falhar (ver [`user-admin.md`](user-admin.md)).

## Coolify

1. **Database** → _New_ → PostgreSQL **17**, no mesmo servidor e na mesma _destination_ (rede Docker) do app. _Initial database_ `lorkarium`. Não exponha a porta pública.
2. **S3 Storage** (menu _Storages_): endpoint `https://s3.sa-east-1.amazonaws.com`, região `sa-east-1`, o bucket e a chave de backup. _Validate_.
3. No recurso do banco → _Backups_ → agendamento (cron, ex. `0 4 * * *`), _Save to S3_ com o storage acima, retenção local curta. Rode um _Backup now_ e confira o objeto no bucket.
4. **Application** → _New_ → repositório GitHub (GitHub App do Coolify, para o webhook) → branch `main` → build pack **Dockerfile** (`Base Directory` `/`, `Dockerfile Location` `/Dockerfile`).
5. _Ports Exposes_ `3333` e _Ports Mappings_ **vazio**: a porta só pode ser alcançada pelo Traefik (ver Armadilhas, `TRUST_PROXY`). _Domains_ `https://mesa.example.com` (o `https://` faz o Traefik emitir o certificado Let's Encrypt e redirecionar o http).
6. _Health Check_ do painel **desligado**: ele exige `curl`/`wget`, que a imagem não tem; o `HEALTHCHECK` do Dockerfile já vale.
7. **Sem réplicas** e sem escalar horizontalmente: o server é instância única (spec §5.7; fila por mesa, presença e expulsão do Socket.IO em memória).
8. _Environment Variables_: a tabela abaixo, todas **runtime** (desmarque _Build Variable_: nenhuma é usada no build e segredo não deve ir para a camada da imagem).
9. _Auto Deploy_ ligado (push na `main` → deploy).

## Envs (produção)

Lidas por `server/src/config/env.ts`; a regra completa de cada uma está em [`server.md`](server.md) (Env). "Obrig." = o boot recusa sem ela em produção; "Na prática" = tem padrão, mas o padrão está errado para esta infra. `KEY=` vazio vale como ausente.

| Variável                        | Produção       | Segredo | Valor / como gerar                                                                                                      |
| ------------------------------- | -------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | já na imagem   | não     | `production` (não sobrescreva)                                                                                          |
| `PORT`                          | já na imagem   | não     | `3333` (o mesmo do _Ports Exposes_)                                                                                     |
| `HOST`                          | padrão         | não     | `0.0.0.0` (padrão; não mude, ou o Traefik não alcança o container)                                                      |
| `CLIENT_DIST_DIR`               | já na imagem   | não     | `/app/client/dist`; sem ela o server não serve a SPA                                                                    |
| `DATABASE_URL`                  | **obrig.**     | **sim** | a _Postgres URL (internal)_ do recurso Database: `postgres://<usuário>:<senha>@<id-do-recurso>:5432/lorkarium`          |
| `DATABASE_POOL_MAX`             | padrão         | não     | `10`; abaixo do `max_connections` do Postgres (100)                                                                     |
| `DATABASE_STATEMENT_TIMEOUT_MS` | padrão         | não     | `5000`                                                                                                                  |
| `DATABASE_LOCK_TIMEOUT_MS`      | padrão         | não     | `2000`                                                                                                                  |
| `TRUST_PROXY`                   | **na prática** | não     | `1` atrás do Traefik (nuvem cinza); `2` com a nuvem laranja. Padrão `0` junta todo mundo num balde do rate limit        |
| `APP_PUBLIC_URL`                | **obrig.**     | não     | `https://mesa.example.com`, sem barra final: base dos links dos e-mails                                                 |
| `ADMIN_EMAIL`                   | opcional       | não     | e-mail do primeiro admin, criado no boot se não existir (nunca troca senha nem papel depois)                            |
| `ADMIN_PASSWORD`                | opcional       | **sim** | 12+ caracteres em produção (`openssl rand -base64 18`); só junto com `ADMIN_EMAIL`                                      |
| `S3_ENDPOINT`                   | **obrig.**     | não     | `https://s3.sa-east-1.amazonaws.com`                                                                                    |
| `S3_REGION`                     | **na prática** | não     | `sa-east-1` (o padrão `us-east-1` assina para a região errada)                                                          |
| `S3_BUCKET`                     | **obrig.**     | não     | o bucket dos assets, já criado                                                                                          |
| `S3_ACCESS_KEY_ID`              | **obrig.**     | não     | a chave do `lorkarium-app`                                                                                              |
| `S3_SECRET_ACCESS_KEY`          | **obrig.**     | **sim** | o segredo da mesma chave (8+ caracteres)                                                                                |
| `S3_FORCE_PATH_STYLE`           | **na prática** | não     | `false` na AWS (o padrão `true` é para SeaweedFS/MinIO)                                                                 |
| `DATA_ENCRYPTION_KEY`           | **obrig.**     | **sim** | `openssl rand -base64 32` (32 bytes). **Guarde uma cópia fora do servidor**: perdê-la perde os e-mails e o 2FA cifrados |
| `SMTP_URL`                      | **obrig.**     | **sim** | `smtp://` ou `smtps://` do provedor (seção E-mail); usuário e senha **URL-encoded**                                     |
| `MAIL_FROM`                     | **na prática** | não     | `Lorkarium <no-reply@mesa.example.com>`, no domínio com SPF/DKIM                                                        |

O erro de boot cita cada variável errada e redige os segredos; ele aparece no log do deploy no Coolify.

## DNS

- **Cloudflare só como DNS (nuvem cinza)**, o padrão deste deploy: registro `A` (e `AAAA`, se houver) de `mesa.example.com` para o IP do VPS, _Proxy status_ **DNS only**. O Traefik é o único proxy; `TRUST_PROXY=1`. Crie o registro antes do primeiro deploy, para o Let's Encrypt validar.
- **Passar para a nuvem laranja** (proxy da Cloudflare) depois, nesta ordem, conferindo num ambiente de staging antes:
  1. Traefik do Coolify (_Servers_ → _Proxy_): `--entrypoints.https.forwardedHeaders.trustedIPs=` com as faixas IPv4 e IPv6 publicadas pela Cloudflare (o mesmo no entrypoint `http`). Sem isso o Traefik descarta o `X-Forwarded-For` da Cloudflare e o app vê o IP da borda.
  2. `TRUST_PROXY=2` (Cloudflare + Traefik) e redeploy.
  3. SSL/TLS da Cloudflare em **Full (strict)**; WebSockets ligados (padrão).
  4. Conferir o IP: o teste de rate limit da conferência abaixo, e o IP em Sessões ativas tem que ser o seu, não um da Cloudflare.
  5. Opcional: firewall do VPS aceitando 80/443 só das faixas da Cloudflare.
- Saltos a mais (`TRUST_PROXY` maior que os proxies reais) deixam o cliente forjar o IP pelo `X-Forwarded-For` e fugir do limite; a menos juntam todo mundo no IP do proxy.

## Primeiro deploy e conferência

O primeiro deploy migra o banco vazio inteiro (as `0000…` de `server/drizzle/`) e cria o admin do `ADMIN_*`. No log: "migrations applied" antes de "Server listening".

- [ ] `https://mesa.example.com/api/health` → 200 `{"status":"ok"}`; o container `healthy` no Coolify.
- [ ] `https://mesa.example.com/` e um deep link (`/campaigns/x`) abrem a SPA; certificado válido.
- [ ] Login com o `ADMIN_EMAIL`. Troque a senha pelo app e tire `ADMIN_PASSWORD` (e `ADMIN_EMAIL`) das envs: o seed não precisa mais delas.
- [ ] Rate limit pelo IP real: de outra rede (celular no 4G), errar a senha do **seu** e-mail 6 vezes (a 6ª dá 429, o limite é 5/min por IP + e-mail); do computador, o login certo entra. Se o computador também levar 429, o `TRUST_PROXY` está errado.
- [ ] Criar uma mesa e enviar uma imagem de fundo: o objeto aparece em `assets/<uuid>` no bucket e a imagem carrega no tabuleiro.
- [ ] Socket.IO: DevTools → Network → WS mostra `wss://mesa.example.com/api/socket.io/?EIO=4&transport=websocket` com 101; abrir a mesa em duas abas e mover um token aparece na outra.
- [ ] Backoffice → Teste de e-mail para um endereço seu: chega, fora do spam, com links em `https://mesa.example.com`.
- [ ] _Backup now_ no banco e o objeto no bucket de backups.

## Atualizar e voltar

- **Atualizar**: push (merge) na `main` → webhook do Coolify → build da imagem → container novo sobe, migra e só recebe tráfego quando o `HEALTHCHECK` fica `healthy`; aí o antigo para (_rolling update_ do build pack Dockerfile).
- **Migração que falha**: o migrador aplica as pendentes numa transação só, então desfaz tudo; o container novo sai com 1, nunca fica `healthy` e o **antigo segue no ar**. Leia o erro no log do deploy, corrija e publique de novo.
- **Voltar o código**: _Deployments_ do Coolify → redeploy de um commit anterior (ou `git revert` na `main`). Só é seguro se nenhuma migração nova entrou: migração **não tem _down_**.
- **Voltar o banco**: o caminho é o **backup**. Antes de publicar uma migração que mexe em dado, rode _Backup now_. Para restaurar: parar a Application, restaurar o dump no recurso do banco (restauração do Coolify ou `pg_restore --clean` com o dump baixado do S3), publicar o commit compatível com aquele schema.

## Armadilhas

- **`Host` preservado**: o handshake do Socket.IO exige o host do `Origin` igual ao `Host`. O Traefik do Coolify preserva por padrão; qualquer proxy a mais (Cloudflare laranja, outro nginx) também precisa. Sintoma: a página abre, mas a mesa não conecta (`connect_error`).
- **`s3:ListBucket` no IAM**: sem ele o `HeadBucket` do boot dá 403 e o app não sobe. O `Resource` dele é o ARN do bucket **sem** `/*`.
- **`DATA_ENCRYPTION_KEY`**: perder ou trocar a chave deixa os e-mails e os segredos de 2FA ilegíveis (ninguém loga, o backup do banco não ajuda). Guarde cópia num cofre fora do VPS; o backup do Postgres sozinho não basta.
- **Duas instâncias por segundos**: no _rolling update_ o antigo e o novo rodam juntos até o novo ficar `healthy`, e a migração roda com o antigo ainda servindo. Migração que quebra o código anterior (renomear ou apagar coluna) vale ser feita em dois deploys (adicionar → depois remover).
- **`TRUST_PROXY` conta saltos, não confere quem é o proxy**: desde o 5.12 o Fastify recusa `trustProxy` numérico ("não confia em nada"), então o server passa uma função por salto (`trustProxyOf`, ver `server.md`). Quem alcançar a porta 3333 direto (porta publicada no VPS) forja o `X-Forwarded-For` e foge do rate limit do login. Mantenha _Ports Mappings_ vazio e o firewall fechado fora de 80/443.
- **Réplicas**: nunca. A fila por mesa e a expulsão de sockets são em memória (§5.7).
- **`SMTP_URL` com caractere especial** na senha (`@`, `/`, `:`): URL-encode, senão o boot recusa a URL ou o login SMTP falha.
- **Porta SMTP bloqueada**: alguns VPS (Hetzner, conta nova) bloqueiam saída na 25 e na 465. Use a 587 (`smtp://`, STARTTLS) e confira pelo Teste de e-mail.
- **Healthcheck do painel ligado**: sem `curl` na imagem ele nunca passa e o deploy é dado como falho.
