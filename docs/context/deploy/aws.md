# Deploy — AWS (S3 e IAM)

Detalhe da seção AWS de [`../deploy.md`](../deploy.md). Tudo é feito à mão no console, uma vez; o app não cria nada na AWS.

## Bucket dos assets

- S3 → _Create bucket_, tipo _General purpose_, região **`sa-east-1`** (São Paulo), nome único global (`lorkarium-assets-<sufixo>`).
- _Object Ownership_: **ACLs disabled** (padrão). _Block all public access_: **ligado** (padrão). Ninguém lê o bucket direto: o server lê e entrega pela origem (`GET /api/assets/:id`, ver [`../assets.md`](../assets.md)).
- Cifra padrão SSE-S3 (padrão do console). Versionamento: desligado (o app nunca reescreve uma chave; `assets/<uuid>` e `avatars/<uuid>`).
- O bucket precisa existir **antes** do primeiro deploy: o usuário IAM mínimo não tem `s3:CreateBucket`. O código cria fora de `us-east-1` com `LocationConstraint`, mas isso só vale para quem tem a permissão (dev, SeaweedFS).

## Usuário IAM do app

IAM → _Users_ → `lorkarium-app`, sem acesso ao console. _Add permissions_ → _Create inline policy_ → JSON (troque o nome do bucket):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "HeadBucketNoBoot",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::lorkarium-assets-SUFIXO"
    },
    {
      "Sid": "ObjetosDoApp",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::lorkarium-assets-SUFIXO/*"
    }
  ]
}
```

- `s3:ListBucket` no **bucket** (sem `/*`) é o que autoriza o `HeadBucket` do `ensureBucket` no `onReady`. Sem ele a AWS responde 403, o boot falha com `AssetStorageError` e o container nunca fica `healthy`.
- _Security credentials_ → _Create access key_ → "Application running outside AWS" → `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY`. O segredo aparece uma vez só.
- Troca da chave: crie a segunda, troque as envs no Coolify, redeploy, desative e apague a antiga.

## Bucket dos backups do Postgres

Recomendado: um **segundo bucket** (`lorkarium-backups-<sufixo>`, mesma região, mesmo _Block Public Access_) com um usuário IAM próprio (`lorkarium-backup`, mesma política com o outro ARN). Assim a chave do app, que mora no container, não apaga backup.

- Alternativa aceita pelo plano: o mesmo bucket com outro prefixo (`backups/`). Aí o usuário do app consegue apagar os dumps; restrinja o `Resource` do app a `…/assets/*` e `…/avatars/*` se for por esse caminho.
- _Lifecycle rule_ no bucket de backups: expirar objetos depois de N dias (30, por exemplo), senão o custo só cresce.
- A chave vai no Coolify (_S3 Storages_), não nas envs do app.

## Bucket dos registros de acesso

Os registros de acesso do art. 15 do Marco Civil (6 meses; o que entra em [`../access-log.md`](../access-log.md)). Um **terceiro bucket**, com usuário IAM só de escrita: a chave mora no container, então não pode ler nem apagar o que guardou.

1. S3 → _Create bucket_: `lorkarium-access-log-<sufixo>`, na **mesma região do bucket dos assets** (na produção atual, `us-east-2`). ACLs disabled, _Block all public access_ ligado, SSE-S3, versionamento **desligado** (cada chave é escrita uma vez só).
2. Bucket → _Management_ → _Create lifecycle rule_:
   - nome `expira-registros-184-dias`, escopo **Limit the scope**, prefixo `access-log/`;
   - _Expire current versions of objects_: **184** dias (o maior intervalo de 6 meses seguidos: toda linha fica pelo menos 6 meses);
   - _Delete expired object delete markers or incomplete multipart uploads_: incompletos depois de 1 dia.
3. IAM → _Users_ → `lorkarium-access-log`, sem console, política inline (troque o bucket):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SoGravaRegistros",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::lorkarium-access-log-SUFIXO/access-log/*"
    }
  ]
}
```

4. _Create access key_ ("Application running outside AWS") → no Coolify, `ACCESS_LOG_S3_BUCKET`, `ACCESS_LOG_S3_ACCESS_KEY_ID`, `ACCESS_LOG_S3_SECRET_ACCESS_KEY`. Endpoint e região vêm do `S3_ENDPOINT`/`S3_REGION` dos assets.
5. Conferência depois do deploy: aparece `access-log/boots/AAAA/MM/DD/<hora>Z-<boot>.jsonl.gz` (a marca do boot) e, 5 min depois, o primeiro `access-log/AAAA/MM/DD/…-0.jsonl.gz`. Chave errada **derruba o boot** (o container nunca fica `healthy`; o antigo segue no ar): leia `AccessLogArchiveError` no log do deploy.

**Quem lê.** Ninguém no dia a dia: não há credencial de leitura. O responsável da Evolutiva lê pelo console, com o usuário administrador da conta e MFA, só por requisição de autoridade, defesa em processo ou incidente de segurança: bucket → `access-log/AAAA/MM/DD/` → _Download_ → `zcat arquivo.jsonl.gz | jq 'select(.userId == "<uuid>")'` (ou `select(.ip == "…")`). Um lote passa da meia-noite UTC: baixe também o último do dia anterior. Para auditar quem leu, ligue os _data events_ de leitura do bucket no CloudTrail (custo por evento; leitura é rara).

**Preservar além dos 6 meses** (art. 15, § 2º: a autoridade pode pedir a guarda por mais tempo). Antes de o prazo vencer, copie os objetos pedidos para fora do prefixo da regra, com o usuário administrador:

```bash
aws s3 cp s3://lorkarium-access-log-SUFIXO/access-log/2026/10/25/ s3://lorkarium-access-log-SUFIXO/preservacao/<processo>/2026/10/25/ --recursive
```

Apague `preservacao/<processo>/` quando a ordem acabar. O app não grava nem lê esse prefixo.

**Custo**: cada linha tem ~150 bytes e o gzip corta ~10×; meses de uso cabem em poucas centenas de MB e ~9 mil `PutObject` por mês (um a cada 5 min). Centavos.

## Custos (confira antes de assinar)

- Conta nova desde **15/07/2025**: escolhe o plano **Free** (créditos de US$ 100 a 200, por até 6 meses) ou o **Paid**. O S3 não tem mais cota "sempre grátis" para conta nova: armazenamento, requisições e saída consomem os créditos. Confira na página oficial do AWS Free Tier; isto pode ter mudado.
- **Tráfego de saída** é o custo que cresce: o server baixa cada asset do S3 e o entrega pela origem. Se o VPS não está na AWS, todo download de imagem para o navegador sai da AWS e é cobrado. O `Cache-Control: private, max-age=31536000, immutable` faz cada navegador baixar cada imagem uma vez só.
- Ligue um _Budget_ (Billing → Budgets) com alerta por e-mail antes de abrir para os jogadores.
- Trocar para o Cloudflare R2 (sem custo de saída) depois é **só env**: `S3_ENDPOINT=https://<conta>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_BUCKET`, as chaves do R2. Copie os objetos antes (`rclone copy`), com o app parado ou em janela de manutenção.
