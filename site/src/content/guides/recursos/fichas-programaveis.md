---
kind: recurso
name: Fichas programáveis
title: Ficha de RPG programável · Lorkarium
description: Escreva a ficha de RPG programável do seu sistema em HTML, CSS e JavaScript, ligada às barras do token, aos dados e aos valores da mesa.
h1: A ficha do seu sistema, escrita do seu jeito
lead: Um botão "−5 PV" na ficha, e o dano já cai na barra do token.
updatedAt: '2026-11-20'
draft: true
order: 5
related: ['recursos/dados-3d', 'recursos/iniciativa-e-condicoes', 'recursos/chat-da-mesa']
faqs:
  - question: Preciso saber programar para ter uma ficha?
    answer: Para escrever um modelo, sim, ao menos HTML. Campos simples se ligam aos valores por atributos, sem JavaScript. Quem joga só preenche a ficha que o mestre deu.
  - question: A ficha pode acessar a internet ou a minha conta?
    answer: Não. A ficha roda isolada, sem rede, e só fala com a mesa pelo SDK. O servidor confere cada pedido como se você o fizesse à mão.
  - question: O JavaScript da ficha roda em qualquer plano?
    answer: Não. No plano Grátis, os scripts do modelo não rodam. A partir do Narrador, rodam. Veja os planos.
---

Uma ficha de RPG programável resolve o que nenhuma ficha pronta resolve: o seu sistema, com as suas regras e o seu layout. No Lorkarium, o mestre escreve o modelo de ficha em HTML, CSS e JavaScript e dá uma ficha a cada personagem. A ficha conversa com a mesa: ajusta as barras do token, põe dados na bandeja e guarda os próprios valores.

## Modelo e ficha

O **modelo** é o código: uma lista de arquivos HTML, CSS e JS, com fontes e imagens próprias. A **ficha** é uma cópia viva do modelo, com os valores de um personagem. As duas ficam na biblioteca da mesa, com nome e pasta.

Cada ficha pode:

- ficar sem dono, visível só para os mestres;
- ir para um jogador, no personagem dele, com ou sem token no grid;
- ir para um token, como o de um NPC.

Um personagem ou token pode ter mais de uma ficha. O jogador abre a ficha principal ao lado do mapa.

## O que a ficha faz na mesa

A ficha fala com a mesa pelo SDK `window.lorkarium`. Com ele, o código do modelo:

- lê o nome e a imagem do token, as barras e os valores guardados;
- ajusta uma barra, como no botão "−5 PV";
- grava valores, como a Força do personagem;
- rola dados e recebe o resultado;
- lê os documentos públicos da mesa.

Para campos simples, nem é preciso JavaScript. O atributo `data-lk` liga um campo a um valor, `data-lk-roll` rola uma fórmula e `data-lk-tray` põe um bônus na [bandeja de dados](/recursos/dados-3d/). Se o modelo cria barras, elas param no teto de barras do plano do dono da mesa.

## Isolada do resto da página

A ficha roda num quadro isolado, sem rede, sem acesso aos cookies e sem acesso ao resto do app. O SDK só age sobre o dono da ficha e nunca faz mais do que a pessoa que olha a ficha faria à mão: o servidor reautoriza cada pedido. Um valor gravado nunca vira código: um `<script>` digitado num campo não roda.

## O editor de modelo

O editor tem o código de um lado e a prévia do outro. A prévia roda de novo a cada pausa na digitação. O autocompletar conhece o SDK, a aba API explica cada função com exemplo e o console mostra os erros do modelo. Um modelo novo já nasce com um exemplo comentado: PV, Força, "−5 PV" e "Rolar ataque".

Quando o modelo estiver pronto, exporte-o num arquivo `.lksheet` e importe em outra mesa. Exportar e importar é só do mestre.

## O que depende do plano

O número de modelos por mesa e a execução do JavaScript seguem o plano do dono da mesa. No Grátis, os scripts do modelo não rodam. Confira os [planos](/planos/) e veja na [página inicial](/#combate) uma ficha ajustando a barra no meio do combate.
