# Link (`ImageFetcherPort`)

O server baixa o link e guarda a imagem como um envio: o WebGL recusa textura de outra origem sem CORS, o link some com o tempo e o hotlink exporia o IP dos jogadores.

- `server/src/modules/assets/image-fetcher.port.ts` — `fetch(url) → FetchOutcome`: `{ ok: true, image: FetchedImage { bytes, contentType | null } }` (o tipo é só dica: quem decide é o processador) ou `{ ok: false, refusal: FetchRefusal }` = `blocked { host, address }` | `unreachable { reason }` | `too-large { limit, received | null }`. Dentro do adaptador a recusa viaja pelos callbacks do socket numa exceção local (`FetchRefused`) e o `fetch` a devolve como valor.
- `server/src/infrastructure/image-fetcher/address-policy.ts` — `AddressPolicy { allows(address) }`, `isPublicAddress(ip)` sobre `node:net` `BlockList` e `publicAddressPolicy`. Fora: `0/8`, `10/8`, `100.64/10` (CGNAT), `127/8`, `169.254/16` (o 169.254.169.254 dos metadados de nuvem), `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4`, `240/4`; no IPv6 `::/96`, `::1`, `64:ff9b::/96` (NAT64), `2001:db8::/32`, `fc00::/7`, `fe80::/10`, `ff00::/8`. O IPv4 mapeado (`::ffff:127.0.0.1`) cai na regra do IPv4 sozinho (o `BlockList` confere). Texto que não é IP não é público.
- `server/src/infrastructure/image-fetcher/guarded-image-fetcher.ts` (`GuardedImageFetcher({ policy?, maxBytes?, timeoutMs?, maxRedirects? })`, sobre `node:http`/`node:https`, sem dependência):
  - **`lookup` próprio no socket**: resolve com `all: true`, recusa se **qualquer** endereço não passa na política e devolve à conexão o mesmo endereço conferido. Conferir antes e conectar depois (outra resolução) deixaria passar o DNS rebinding.
  - IP literal na URL não passa pelo `lookup` do Node: é conferido à parte, antes do pedido (com os colchetes do IPv6 tirados).
  - Só `http:`/`https:` em cada salto; até 3 redirects (301/302/303/307/308), cada um conferido de novo; o 4º → `unreachable` "made too many redirects (more than 3)".
  - 10 s para o download inteiro (`AbortSignal.timeout`, valendo para todos os saltos) → "did not answer within 10000 ms"; status ≠ 200 → "answered HTTP 404"; conexão recusada → "could not be reached (ECONNREFUSED)".
  - Acima de 20 MiB (`ASSET_MAX_BYTES`): pelo `Content-Length` declarado, ou contando os bytes enquanto chegam, a resposta é destruída e vira `too-large` (`received: null` quando cortada).
  - `agent: false`: sem conexão reaproveitada entre saltos.
  - Cabeçalhos `User-Agent: Lorkarium/1.0 (image link fetcher)` e `Accept` de imagem em todo salto: hosts como o Wikimedia respondem 403 a pedido sem `User-Agent` (o link parecia "inacessível").
- O service traduz a recusa (`linkErrorOf`): `blocked` → `LinkBlockedError(host, address)` (`LINK_BLOCKED`), `unreachable` → `LinkUnreachableError(url, motivo)` (`LINK_UNREACHABLE`, "link <url> answered HTTP 404"), `too-large` → `AssetTooLargeError(limit, received | null)` (`ASSET_TOO_LARGE`).
