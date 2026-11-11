# Cache em disco dos objetos do S3

O VPS não está na AWS: todo `GetObject` é tráfego de saída cobrado. Com `ASSET_CACHE_DIR`, o server guarda cada objeto no disco na primeira leitura (ou no envio) e serve do disco depois. Vale porque **o conteúdo de uma chave nunca muda**: imagem nova ganha `assets/<uuid>`, `avatars/<uuid>` ou `dice-textures/<uuid>` novos, então uma cópia nunca fica velha.

O cache fica **abaixo** da checagem de permissão: o service confere a participação e a política de leitura antes do `open`, e o disco só muda de onde vêm os bytes. Um cache de proxy (nginx) guardaria a resposta já autorizada e vazaria o mapa privado de uma mesa para outra.

## Peças (`server/src/infrastructure/asset-storage/`)

- `cache-eviction.ts` — `evictionFor(entries, maxBytes, incomingBytes)` → `{ kind: 'fits', evict: string[] }` ou `{ kind: 'too-large' }`. Regra pura: descarta o menos usado (`lastUsedAt`) até o novo caber; empate de uso cai na ordem da chave (mesma entrada, mesmo resultado); total + novo exatamente no teto cabe sem descartar; objeto maior que o teto não guarda nem descarta nada.
- `in-flight-loads.ts` — `InFlightLoads<T>.run(key, work)`: single-flight por chave. Duas misses simultâneas da mesma chave dividem um download; nada é guardado depois que o trabalho termina, então uma falha é tentada de novo pela chamada seguinte.
- `disk-object-cache.ts` — `ObjectCache` (o que o decorador consome: `read`, `write(key, body, size, contentType)`, `writeBytes`, `delete`) e `DiskObjectCache({ dir, maxBytes, clock })`:
  - Pasta plana: `<sha256 da chave>.bin` (os bytes) + `<sha256>.json` (`{ key, size, contentType }`). A chave nunca vira caminho (§8.5): `../x` fica dentro da pasta.
  - Gravação por temporário `<sha256>.<uuid>.tmp` + `rename` (dado primeiro, metadado por último): nunca há arquivo pela metade visível. Fluxo que quebra ou traz bytes diferentes do `size` anunciado → rejeita (`ShortObjectError` cita a chave e os dois tamanhos) e apaga o temporário.
  - Índice em memória (`Map` chave → tamanho, tipo, último uso pelo `ClockPort`); a leitura renova o uso. `init()` cria a pasta, apaga `*.tmp`, dado sem metadado e metadado sem dado (ou de tamanho divergente) deixados por uma queda, reconstrói o índice (o `mtime` do dado vale como último uso) e descarta o excesso se o teto baixou.
  - Objeto acima do teto: o corpo é destruído e nada é gravado.
- `disk-cached-asset-storage.ts` — `DiskCachedAssetStorage({ inner, cache, onCacheFailure })`, decorador da `AssetStoragePort`:
  - `open`: hit → disco. Miss → `InFlightLoads` → `inner.open` → `cache.write` → `cache.read`; chave ausente no S3 → `null` e nada é guardado.
  - `put`: grava no S3 (fonte da verdade) e no disco (os bytes já estão na memória depois do `sharp`; a mesa abre a imagem logo em seguida).
  - `remove`: apaga no S3 e no disco (foto de perfil trocada some da pasta).
  - **O disco nunca derruba a leitura:** falha ao ler ou gravar no disco → reabre do S3 e chama `onCacheFailure({ operation, key, error })`. Erro do S3 chega igual a quem chamou.

## Ligar (`server/src/app/wire-asset-storage.ts`)

- `wireAssetStorage(app, env, clock)`: sempre um `S3AssetStorage` (`onReady` → `ensureBucket()`, `onClose` → `destroy()`). Com `env.assetCache` (`ASSET_CACHE_DIR` + `ASSET_CACHE_MAX_MB`, ver `server.md`), embrulha no `DiskCachedAssetStorage` e soma `onReady` → `cache.init()`.
- Sem `ASSET_CACHE_DIR` (dev, CI, integração) nada muda: lê direto do SeaweedFS. A imagem de produção define `ASSET_CACHE_DIR=/var/cache/lorkarium/assets`; o volume persistente do Coolify está em `deploy.md`.
- Falha do disco vai ao log como `warn` JSON `{ operation, key, reason }` com a mensagem "asset disk cache failed; served from S3". Um aviso a cada miss = pasta sem permissão de escrita (bind mount do `root`, ver `deploy.md`).
- Uma instância por app (§5.7). Com várias, cada uma teria seu cache: continua correto (chave imutável), só com acertos menores.

## Testes

- Unit (`server/test/infrastructure/asset-storage/`): `cache-eviction.spec.ts`, `in-flight-loads.spec.ts`, `disk-object-cache.spec.ts` (pasta real de `mkdtemp`, `ClockFake` avançado à mão), `disk-cached-asset-storage.spec.ts` (fakes em `test/support/asset-cache-fakes.ts`).
- Integração `server/test/integration/asset-disk-cache.spec.ts`: o objeto apagado direto do bucket ainda sai do disco; membro só de outra mesa e jogador diante de `library_image` privada já em cache levam 404 `ASSET_NOT_FOUND`; foto trocada some da pasta; sem `assetCache`, o objeto apagado dá 404.

## Armadilhas

- **Toda rota que serve bytes confere a permissão antes do `open`.** O disco não sabe de mesa nem de usuário: um `open` sem guarda serve do cache o que a política negaria.
- Objetos órfãos no bucket (mesa excluída) continuam lá; o LRU só os tira do disco.
- Não há métrica de hit/miss: o log só registra a falha do disco.
