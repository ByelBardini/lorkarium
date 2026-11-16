# Client — "Falar como" no chat

Hub: [`chat.md`](chat.md). Regra do server: [`../chat.md`](../chat.md). Contrato: [`../contracts/chat.md`](../contracts/chat.md).

## Regras do server que a tela precisa respeitar

- "Falar como" token ou personagem só vale **na Mesa sem sussurro**; o token ainda exige o grid aberto nesta conexão, o personagem não (só o controle). No resto o compositor manda `speaker: { kind: 'self' }`.

## Tela

- `useSpeakAsVoice({ board, characters }, chat, role)` e `SpeakAsMenu` oferecem Você, a seção **Personagens** (os `CharacterDto` com `canControl`, do `characters` da mesa aberta: fala mesmo sem token em grid nenhum) e a seção **Tokens do grid** (tokens controláveis do grid mostrado que não são de um personagem listado — o token ligado fala como o personagem, e escolher o token pelo id cai no personagem dele); espectador não tem menu. A escolha mora na store da mesa (`speakAsId`, id de token ou de personagem, `sessionStorage` `lorkarium.chat.<campaignId>.speakAs`), não no painel: a gaveta só monta aberta, e fechá-la desmontaria a voz. Os tokens vêm do `useTokensBesidesPose`: mover token não re-renderiza a voz; renomear, sim. O token ausente ou sem controle volta visualmente para Você; `speaker_not_found` também limpa a escolha. O compositor envia token apenas na Mesa sem sussurro, mesmo se a escolha continuar guardada ao entrar em privado/grupo.
- A lista "Falar como" usa apenas a camada Tokens e elimina nomes exatamente repetidos, mantendo o primeiro token elegível com aquele nome.
- Linha falada como personagem mostra as iniciais do nome no avatar (o evento não traz retrato); a falada como token usa o rosto do grid aberto (`useChatTokenFaces`).
- `src/lib/chat-speaker.ts` — `spokenNameOf(speaker)` (nome do token/personagem, `null` como si) e `spokenVoiceIdOf(speaker)` (chave da voz no bloco do feed). Código novo que lê `speaker` usa estes dois, nunca `kind === 'token'` sozinho (o personagem cairia como "si").

## Armadilhas

- A voz escolhida vive acima do compositor de cada conversa. Ao trocar da Mesa para privado/grupo, o envio precisa conferir o canal além de `whisperTo`: só testar sussurro nulo deixava a voz do token vazar e o server recusava com `CHAT_SPEAKER_NOT_ALLOWED` (regressão de 2026-10-28 em `speak-as-menu.spec.tsx`).

## Testes

`test/features/chat/use-speak-as-voice.spec.tsx` (personagem sem grid, token ligado cai no personagem, sem controle volta a si, renders) e `speak-as-menu.spec.tsx` (seções Personagens / Tokens do grid, sem repetir o token ligado).
