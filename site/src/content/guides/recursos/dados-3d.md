---
kind: recurso
name: Dados 3D
title: Dados 3D online para RPG · Lorkarium
description: Role dados 3D online para RPG sobre o mapa, com física no servidor, vantagem, rolagem secreta e fórmulas salvas em pastas para cada mesa.
h1: Dados 3D online que a mesa inteira vê cair
lead: O d20 rola sobre o mapa, e o resultado é a face em que ele parou.
updatedAt: '2026-11-20'
draft: true
order: 3
related: ['recursos/chat-da-mesa', 'recursos/fichas-programaveis', 'recursos/grid-de-combate']
faqs:
  - question: Quem decide o resultado do dado?
    answer: O servidor. Ele simula a física do arremesso, e o valor é a face em que o dado parou. Todos na mesa veem o mesmo lançamento.
  - question: Posso rolar sem mostrar o resultado aos jogadores?
    answer: Sim. Na rolagem secreta, só você e os mestres veem o resultado. Os outros recebem apenas o aviso de que houve uma rolagem.
  - question: Dá para desligar os dados 3D?
    answer: Sim. Em Minha conta, os interruptores "Dados 3D" e "Som dos dados" valem só para o aparelho em que você está.
shot: dice
shotAlt: Sala do Lorkarium com dados 3D rolando sobre o mapa e o painel de dados mostrando o resultado de cada dado.
---

Dados 3D online para RPG só fazem sentido se todos virem a mesma coisa. No Lorkarium, quem rola é o servidor: ele simula a física do arremesso, e o resultado é a face em que o dado parou. Quem está na mesa vê o mesmo lançamento cair sobre o mapa, e o painel mostra cada dado, os modificadores e o total.

## Do d4 ao d100

Os dados de 4, 6, 8, 10, 12 e 20 faces rolam em 3D, e o d100 rola como dois dados, dezena e unidade. Dados sem modelo, como o d2 ou o d1000, saem de um sorteio no servidor, sem animação.

Quantos dados rolam em 3D numa rolagem depende do plano do dono da mesa: no Grátis são 8, e os planos acima levam mais. A bola de fogo com mais dados que isso não é recusada: os que passam do teto saem do sorteio, sem modelo 3D. Veja os [planos](/planos/).

## Monte a rolagem na bandeja

A aba Dados tem a bandeja. Você clica nos dados, soma modificadores ou digita a fórmula, como 1d20+5. A notação aceita as regras mais comuns:

- manter ou descartar os maiores e menores, como 4d6dl1 ou 2d20kh1;
- dados que explodem, como 1d6!;
- rerrolar o 1, como 1d20r;
- contar sucessos, como 8d10>=7.

Vantagem e desvantagem são um clique: com a bandeja vazia, o botão já põe o d20. Junte partes com nome na mesma rolagem, como "Acerto + Bênção", e o histórico mostra "Acerto 17 + Bênção 3".

## Rolagens salvas por mesa

Guarde em pastas as fórmulas que você repete: o ataque da espada, o teste de furtividade, a bola de fogo. Cada salva é sua e fica naquela mesa, pronta para cair na bandeja com um clique. O número de salvas segue o maior entre o plano do dono da mesa e o seu.

## Rolagem secreta e rolagem pelo chat

Na rolagem secreta, só você e os mestres veem o resultado. Os outros sabem que houve uma rolagem, mas não veem total, dados nem a animação, porque a pose final revelaria a face.

Você também rola pelo chat: digite /r 1d20+5 para uma rolagem pública ou /gr 1d20+5 para uma só sua e dos mestres. Uma rolagem salva vira um comando com o nome dela. Veja o [chat da mesa](/recursos/chat-da-mesa/).

## O que fica guardado

A rolagem não é gravada no servidor. O histórico de resultados vive no navegador durante a visita à mesa, e quem entra depois não recebe o anterior. A sua conta só guarda os contadores: quantas rolagens você fez e quantos 20 naturais já tirou, que aparecem no seu perfil.

Quer rolar a partir da ficha do personagem? Uma [ficha programável](/recursos/fichas-programaveis/) pode pôr dados direto na bandeja.
