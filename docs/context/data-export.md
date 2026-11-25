# Data export

"Baixar meus dados" (LGPD art. 18 e 19): a conta baixa um ZIP com tudo o que o Lorkarium guarda sobre ela, uma vez por dia, sem trabalho manual de ninguém. Os dados de pagamento ficam no serviço de cobrança e saem por rota própria (`GET /api/billing/export`, ver [`billing.md`](billing.md)). Server em `server/src/modules/data-export/`, client em `client/src/features/account/data-export-section.tsx`. DTOs em `packages/contracts/src/account/data-export.dto.ts`.

## Contrato (prefixo `/api`)

| Rota                  | Saída                                                                                                                                             | Erros                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /account/export` | 200 `application/zip`, `Content-Disposition: attachment; filename="lorkarium-dados-<@>-<AAAA-MM-DD>.zip"` (dia em UTC), `Cache-Control: no-store` | 401 `UNAUTHENTICATED` · 429 `EXPORT_TOO_SOON` (`DATA_EXPORT_TOO_SOON_CODE`) com `retryAfterSeconds` e `Retry-After` |

- **Limite:** uma exportação a cada `DATA_EXPORT_INTERVAL_HOURS` (24 h), contada da última. Coluna `users.data_exported_at` (migração `0120_data_export`, nula = nunca exportou). Por quê: o arquivo lê a conta inteira e todas as imagens; sem limite, a rota vira um jeito barato de carregar o banco e o S3.
- **A marca é gravada antes do arquivo sair**, depois de todas as leituras: uma falha no meio do envio gasta o dia (raro; o LEIA-ME e o JSON vão no começo e no fim). Duas exportações ao mesmo tempo passam pela primeira conferência, mas o `UPDATE … WHERE data_exported_at IS NULL OR data_exported_at <= agora − 24 h` (`AccountExportDao.claimExport`) só deixa uma; a outra recebe o mesmo 429.
- A conta é sempre a da sessão; nada vem do pedido.

## O arquivo

- `dados.json` — o `dataExportDto` (estrito em todos os níveis, `format: 'lorkarium-data-export'`, `version: 1`), com 2 espaços de recuo.
- `imagens/perfil/{foto,banner,textura-dos-dados}.webp` — as imagens da conta que existirem (`avatars/`, `banners/`, `dice-textures/` do bucket).
- `imagens/emojis/<nome>.webp` — cada emoji personalizado (`customEmojiImagesOf`, a chave animada quando é GIF; ver [`custom-emojis.md`](custom-emojis.md)).
- `imagens/mesas/<campaignId>/<assetId>.<ext>` — os assets que a pessoa enviou (`assets.owner_id`), extensão pelo `mime_type` (`png`, `jpg`, `webp`, `gif`, `woff2`).
- `LEIA-ME.txt` — em pt-BR, CRLF: o que é cada parte, o que não está e por quê, e uma linha por imagem que o bucket não tinha mais (o caminho continua citado no `dados.json`).

### O que entra no `dados.json`

`account` (id, @, apelido, e-mail **decifrado**, papel, plano, plano pago e fim, criação, último acesso, troca de senha, aceite e versão dos Termos, quando o 2FA foi ligado, suspensão e fim) · `profile` (cor, bio, preferências de jogo, cor do número do dado, contadores dos dados, caminhos das 3 imagens) · `savedColors` · `customEmojis` (nome, animado, criação) · `friends`, `friendRequests` (enviados e recebidos) e `blocks` (só os que a pessoa fez), sempre pelo @ da outra conta · `reputation` (os votos **dados**, com o @; dos recebidos, só `{ up, down, percent }`, o resumo do card com `REPUTATION_MIN_VOTES`) · `reportsMade` (as denúncias **feitas**: @ e nome da época, mesa, motivo, texto, situação, criação e fechamento) · `sanctions` (as medidas recebidas: tipo, regra, texto, prazo, data da exclusão de um `ban`, contestação e decisão) · `feedback` (os relatos de bug e sugestões **ainda esperando**: as seções, onde, a versão e o envio; sem os prints nem o rascunho da issue; fechado, o relato já não existe, ver [`feedback.md`](feedback.md)) · `badges` (nome, descrição, concessão) · `campaigns` (as mesas em que está: nome, sistema, papel, se é dona, entrada, último acesso) · `characters` (os personagens dela, com as barras) · `sheets` (as fichas que os personagens dela seguram, com o nome do modelo e os valores) · `documents` (os de que é dona ou que escreveu, com as abas que ela lê: aba "só mestres" só de cadeira de mestre) · `savedRolls` (com a pasta) · `sessions` (user agent, persistente, criação, último uso, fim) · `images` (caminho, mesa, finalidade, tipo, tamanho, envio).

### O que não entra, e por quê

- **Hash da senha, índice cego do e-mail, segredo do TOTP, códigos de recuperação, id/hash da sessão:** segredo de autenticação. O DAO escolhe as colunas uma a uma (`EXPORTED_ACCOUNT_COLUMNS`), nunca "todas menos": coluna nova fica fora até alguém decidir.
- **Votos recebidos um a um:** são de outras pessoas (só o resumo). **Denúncias recebidas:** protegem quem denunciou. Da denúncia feita, nunca a nota do admin nem quem fechou; da medida, nunca a denúncia ligada nem o admin.
- **Mesa em que a pessoa não está:** toda consulta de mesa junta `campaign_members` da própria pessoa (`seatAt` em `campaign-export.dao.ts`), então nem o que ela deixou lá (personagem, imagem enviada) sai. Provado no isolamento da integração.
- **Chat e mensagens privadas:** não ficam no servidor. **Dados de pagamento:** no serviço de cobrança. **Registro de acesso (IP):** no S3 do registro, fora da exportação ([`access-log.md`](access-log.md)). **Modelos de ficha** que ela escreveu, **prints** de denúncia e de relato, autoria de desenhos, áreas e tokens, imagens deixadas em mesas de que saiu, comunicados recebidos, convites e troca de e-mail pendente: fora do arquivo. O LEIA-ME ("O resto, por e-mail") e a Privacidade §9 mandam pedir por `privacidade@`, respondido em até 15 dias (LGPD art. 19).

## Estrutura (`server/src/modules/data-export/`)

- `account-export.dao.ts` (`AccountExportDao`: conta, `lastExportOf`, `claimExport`, 2FA, sessões, cores, amigos, pedidos, bloqueios, votos dados, insígnias) · `campaign-export.dao.ts` (`CampaignExportDao`: cadeiras, personagens e barras, fichas, documentos e abas legíveis, rolagens salvas, assets enviados) · `moderation-export.dao.ts` (`ModerationExportDao`: denúncias feitas, medidas recebidas, relatos esperando; lê as tabelas de `reports/`, `sanctions/` e `feedback/`).
- `data-export.bo.ts` — `DataExportBo(intervalMs)`: `requireAllowed(userId, última, agora)` (lança `DataExportTooSoonError` com `nextAt` e `retryAfterSeconds`; exatamente 24 h depois já libera) e `latestLastExportAllowedAt(agora)`.
- `data-export.mapper.ts` — `toDataExportDto(parts, cipher, agora)` (abre o e-mail), `profileImagesOf`, `sentImageOf`; `export-readme.mapper.ts` — `exportReadmeOf`, `exportFileNameOf`.
- `data-export.service.ts` — `DataExportService.export(userId)` → `{ fileName, body: Readable }`: confere o limite → lê tudo (em paralelo) → `claimExport` → devolve o stream; o preenchimento escreve `dados.json`, cada imagem pelo `storage.open` em streaming e o `LEIA-ME.txt` por último. `open` que devolve `null` ou lança vira linha no LEIA-ME (a falha vai ao log com a chave), nunca derruba o arquivo.
- `data-export.routes.ts` · `data-export.plugin.ts` (`createDataExportModule({ db, storage, archives, cipher, clock })`, registrado no `buildApp` logo depois do `plans`) · `data-export.error.ts`.
- **Porta `ArchiveWriterPort`** (`archive-writer.port.ts`): `stream(fill)` → `Readable`; `fill` recebe `addFile(path, bytes)` (comprime) e `addStream(path, body)` (guarda como veio). Adaptador único `server/src/infrastructure/archive/fflate-archive-writer.ts` (`FflateArchiveWriter`, `Zip` + `ZipDeflate`/`ZipPassThrough` do `fflate`): cada pedaço sai assim que é feito, cada arquivo espera o leitor drenar, nada vai ao disco. Leitor que fecha no meio faz o próximo `add*` recusar ("archive reader closed"), em vez de pendurar.

## Client

- `DataExportSection` (aba Segurança de Minha conta, abaixo de "Conta e segurança"; título "Privacidade"): linha "Seus dados" com "Baixar meus dados" ("Preparando o arquivo…" enquanto espera) e linha "Pagamentos" com "Dados de pagamento". Cada linha mostra a própria falha (`role="alert"`, ligada ao botão por `aria-describedby`); uma não trava a outra.
- `services/data-export-api.ts` — `DataExportApi.exportData()` / `HttpDataExportApi` (por `fetch` direto, o corpo é `Blob`, não JSON): `too_soon` (com `retryAfterSeconds`), `offline`, `unexpected`. O nome do arquivo vem do `Content-Disposition`.
- "Dados de pagamento" chama `BillingApi.exportOwn()` e salva o JSON (`lorkarium-pagamentos-<@>-<AAAA-MM-DD>.json`, dia local).
- Download pelo `FileDownload` (`saveBlob` para o ZIP, `save` para o JSON): o mesmo `<a download>` do resto do app, que a casca desktop também salva.
- `data-export-messages.ts` — "Você poderá baixar de novo às 14:30." (ou "amanhã às …"), pelo relógio da pessoa no momento da resposta.

## Testes

- Unit: `server/test/modules/data-export/{data-export.bo,data-export.mapper,export-readme.mapper,data-export.service}.spec.ts` e `server/test/infrastructure/archive/fflate-archive-writer.spec.ts` (abre o ZIP com `unzipSync`). Fakes em `server/test/support/data-export-fakes.ts`: `AccountExportDaoFake` (`lastExports` em ordem, `claimAnswer`, `claims`, `accountReads`), `CampaignExportDaoFake`, `ModerationExportDaoFake`, `ReputationCountsFake`, `ArchiveWriterFake` (`files`, `textOf`, `finished`), `ExportImageLogFake`; `exportedAccountRow` (um `UserPo` inteiro, para provar que o hash não chega ao JSON), `emptyExportParts`, `sentAssetRow`.
- Integração: `server/test/integration/data-export.spec.ts` (ZIP e cabeçalhos, conta da sessão, isolamento — nada de Quelm, nem o que Bia deixou lá —, sem hash nem token e votos só somados, 401, 429 com `Retry-After`, uma conta não trava a outra). DAOs e borda são provados aqui.
- Client: `client/test/features/account/data-export-{section,messages}.spec.ts(x)`, `client/test/services/data-export-api.spec.ts`; `DataExportApiFake` em `client/test/support/data-export-api-fake.ts`; `FileDownloadFake.blobs`.
