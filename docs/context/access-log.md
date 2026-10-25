# Registro de acesso

Guarda dos **registros de acesso à aplicação** do art. 15 do Marco Civil da Internet (Lei 12.965/2014): data e hora, IP e, quando há login, a conta, por **6 meses**, em ambiente de acesso restrito, apagados depois disso. Política de privacidade: seções 3 (Dados técnicos), 5, 6 e 8 de `site/src/content/legal/privacidade.md`. Como ligar na produção: [`deploy/aws.md`](deploy/aws.md) (Bucket dos registros de acesso) e a tabela de envs de [`deploy.md`](deploy.md).

## O que entra e o que nunca entra

- Uma linha JSON por evento, em três tipos (`kind`):
  - `http`: cada requisição respondida pelo Fastify (as rotas de `/api`, os arquivos estáticos e o fallback da SPA): `at` (ISO UTC), `ip`, `userId` (ou `null`), `method`, `route`, `status`.
  - `realtime-connect` e `realtime-disconnect`: cada conexão Socket.IO autenticada que abre e fecha: `at`, `ip`, `userId`. O par dá o intervalo em que a pessoa usou a mesa.
- `route` é o padrão declarado (`/api/campaigns/:campaignId`), nunca a URL crua: ids e query string ficam de fora. Sem rota casada (404, fallback da SPA), o caminho sem a query, cortado em 512 caracteres.
- `ip` é o `request.ip` (com o `TRUST_PROXY`, ver [`server.md`](server.md), Env). O handshake do Socket.IO não passa pelo Fastify: o IP sai de `clientAddressOf(endereço, X-Forwarded-For, saltos)` (`src/realtime/client-address.ts`), a mesma conta do `proxy-addr`.
- Fora, por minimização (LGPD, art. 6º, III): e-mail, cookie, token, corpo, cabeçalhos, user agent. O `GET /api/health` (o `HEALTHCHECK` do container) não entra.
- **Porta lógica de origem: fora por decisão** (2026-10-25). Atrás do Traefik o app não a vê (o `remotePort` é o do Traefik; o `X-Forwarded-Port` é o 443). Pegá-la exige um plugin de terceiro no Traefik ou o access log dele; é decisão à parte (REsp 1.784.156/SP do STJ pede a porta junto do IP).

## Estrutura

- `server/src/modules/access-log/`
  - `access-log.bo.ts` — os tipos de linha (`AccessRecord`), `httpAccessRecordOf(fatos)` (ou `null` para o health), `realtimeAccessRecordOf(tipo, fatos)`, `batchKeyOf(primeiroAt, bootId, sequência)` e `bootKeyOf(agora, bootId)`
  - `access-log.mapper.ts` — `jsonLinesOf(linhas)`: JSON Lines, cada linha com `\n`
  - `access-log-archive.port.ts` — `AccessLogArchivePort.store(chave, jsonLines)`: só escrita
  - `access-log.service.ts` — `AccessLogService`: `start`, `recordHttp`, `recordRealtime`, `flush`, `close`
  - `access-log.routes.ts` — `accessLogResponseHook(service, accountOf)`: o `onResponse` da raiz
  - `access-log.gateway.ts` — `accessLogGateway(service, saltos)`: o ouvinte de conexão do `realtime.onConnection`
  - `access-log.plugin.ts` — `createAccessLogModule(opções)` → `{ service, onResponse, gateway }`
- `server/src/infrastructure/access-log-archive/s3-access-log-archive.ts` — `S3AccessLogArchive`: gzip + `PutObject` (`application/gzip`); `AccessLogArchiveError` cita a chave, o bucket e o motivo do S3, nunca o segredo
- `server/src/infrastructure/s3/s3-client.ts` — `s3ClientOf(config)`, `s3ErrorNameOf`, `s3FailureReasonOf`: o cliente do SDK e o motivo da falha, compartilhados com o `S3AssetStorage`
- `server/src/app/wire-access-log.ts` — `wireAccessLog(app, …)`: escolhe o arquivo (o S3 do `env.accessLog` ou o fake que o spec passa por `AppDependencies.accessLogArchive`), monta o módulo e põe na raiz o `onResponse`, o `start()` no `onReady` e o `close()` no `onClose`

## Fluxo

1. `buildApp` chama `wireAccessLog` **logo depois do `wireAssetStorage`** (o `onReady` roda na ordem de registro, e no dev e no CI os dois moram no bucket que os assets criam) e **antes do `wireRealtime`**, que recebe o `gateway`. O hook da raiz vale também para as rotas dos plugins registrados antes dele (o spec de integração prova com o login). Sem `env.accessLog` e sem fake, nada é ligado (dev e testes).
2. `accountOf` pergunta ao `app.authGuards.userOf`, que lança quando nenhuma guarda rodou: a conta vira `null`. Isso inclui o login e o `GET /api/auth/me`, que resolve a sessão sozinho, sem a guarda; a conta entra pelas rotas com `requireAuth` e pelo `realtime-connect`, que o app faz segundos depois.
3. O `wireRealtime` põe o `gateway` no `realtime.onConnection` antes dos outros ouvintes; a conta é a do `socket.data.user` (o handshake já autenticou).
4. As linhas ficam na memória (`pending`). A cada **5 min** (`FLUSH_INTERVAL_MS`, pelo `TimerScheduler`) e no `onClose` o service grava tudo, no máximo 10 000 linhas por objeto (`BATCH_MAX_RECORDS`). Uma queda do processo perde no máximo os últimos 5 min; o SIGTERM do deploy não perde nada (o `preClose` do realtime fecha as conexões antes, então os `realtime-disconnect` entram no último lote).
5. Lote recusado: volta para a frente da fila, erro no log (`key`, `records`), nova tentativa no próximo turno. Acima de 200 000 linhas pendentes (`PENDING_MAX_RECORDS`, ≈ 40 MB), as 10 000 mais antigas são descartadas com erro no log, para o processo não cair. No `close`, o que o arquivo ainda recusa sai no log como `lost`.
6. **Boot**: no `onReady`, `start()` grava o lote vazio `bootKeyOf` e agenda o primeiro turno. Arquivo que recusa (chave errada, bucket inexistente) **derruba o boot**, como o `HeadBucket` dos assets: o container novo nunca fica `healthy` e o antigo segue no ar.

## O arquivo

- Chave de um lote: `access-log/AAAA/MM/DD/HHMMSSZ-<boot>-<seq>.jsonl.gz`, pelo dia e hora UTC da **primeira** linha. Um lote passa da meia-noite UTC: para um dia, liste também o último objeto do dia anterior.
- Marca de boot: `access-log/boots/AAAA/MM/DD/HHMMSSZ-<boot>.jsonl.gz` (gzip vazio). Data cada início do server; um buraco entre lotes sem boot no meio é o processo que caiu.
- `<boot>` são 8 hex aleatórios por processo: as duas instâncias do _rolling update_ nunca escrevem a mesma chave. Ninguém sobrescreve nada.
- Ler: `zcat 030405Z-a1b2c3d4-0.jsonl.gz | jq 'select(.userId == "<uuid>")'`.

## Env

| Variável                          | Regra                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `ACCESS_LOG_S3_BUCKET`            | o bucket dos registros; **obrigatória em produção**; ausente fora dela = registro desligado |
| `ACCESS_LOG_S3_ACCESS_KEY_ID`     | a chave do usuário IAM só de escrita; obrigatória junto com o bucket                        |
| `ACCESS_LOG_S3_SECRET_ACCESS_KEY` | o segredo da mesma chave, 8+ caracteres; redigido no erro de boot                           |

Endpoint, região e path style são os do `S3_*` (mesma conta e região dos assets). O `Env` entrega `accessLog: StorageConfig | null`.

## Quem acessa e quanto tempo fica

- O app só escreve (`s3:PutObject` em `access-log/*`): não lista, não lê, não apaga. Quem tem a chave do container não apaga registro.
- Leitura: só o responsável da Evolutiva, pelo console da AWS com o usuário administrador (MFA), quando houver requisição de autoridade, defesa em processo ou incidente de segurança. Nenhuma credencial de leitura fica parada.
- Apagamento: a regra de ciclo de vida do bucket expira cada objeto **184 dias** depois de gravado (o maior intervalo de 6 meses seguidos), então toda linha fica pelo menos 6 meses. A AWS apaga em até ~1 dia depois do prazo.
- Preservação além do prazo (art. 15, § 2º): copiar os objetos pedidos para `preservacao/<processo>/`, fora do filtro da regra, e apagar quando a ordem acabar. Passo a passo em [`deploy/aws.md`](deploy/aws.md).

## Testes

- Unit: `server/test/modules/access-log/` (BO, mapper, service com `AccessLogArchiveFake`, `AccessLogFailureLogFake`, `ClockFake` e `SchedulerFake`) e `server/test/realtime/client-address.spec.ts`.
- Integração: `server/test/integration/access-log.spec.ts` (o hook e o gateway no app real, com o fake por `AppDependencies.accessLogArchive`) e `s3-access-log-archive.spec.ts` (gzip e `PutObject` no SeaweedFS). Fakes em `server/test/support/access-log-fakes.ts`; `bytesOf(stream)` em `test/support/streams.ts`.

## Armadilhas

- **`onReady` antes do `wireAssetStorage`** derruba o boot no dev e no CI: a marca de boot vai para um bucket que ainda não existe. A ordem dos `onReady` é a de registro.
- O `close()` do service e o `destroy()` do cliente S3 ficam no **mesmo** `onClose`, nessa ordem: o cliente só fecha depois do último lote.
- O IAM de produção não tem `s3:ListBucket`: não dá para conferir o bucket por `HeadBucket` no boot. A prova é a marca de boot (`PutObject`).
