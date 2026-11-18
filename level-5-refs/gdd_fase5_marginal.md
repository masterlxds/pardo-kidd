# Game Design Document (GDD): *Fase 5 — Marginal de São Paulo (De Uber até o Galpão)*

> **Documento oficial de design — Fase 5, versão 2 (reescrita completa em 18/11/2026).**
> Substitui o GDD anterior. A primeira versão era uma fase de plataforma comum (ônibus para escalar, passarelas, plataformas móveis, rotas altas) com rolagem automática por cima; não tinha a leitura nem o ritmo de um autoscroller. Esta versão parte do zero.
> Documentos irmãos: [`gdd_bestiario_fase5.md`](gdd_bestiario_fase5.md) (carro, inimigos, obstáculos), [`level_design_fase5.md`](level_design_fase5.md) (partitura compasso a compasso) e [`../PLAN-FASE5.md`](../PLAN-FASE5.md) (execução multiagente).

---

## 1. Premissa e lore

Depois da água mineral do **Amaro** no Rio (Fase 4), o Pardo desembarca em São Paulo de madrugada e precisa bater o ponto na transportadora ao amanhecer. Ele chama um carro pelo aplicativo: um **sedã preto com "UBER" na porta e o motorista visível ao volante**. O trânsito está parado, o motorista resolve cortar caminho "por onde der", e o Pardo vai **em pé no teto do carro**, abrindo passagem no soco.

A corrida atravessa quatro cartões-postais, do escuro ao amanhecer: **Marginal Tietê → Minhocão → Túnel → Ponte Estaiada**, e termina no desembarque 5 estrelas na portaria da **Transportadora de São Paulo** (Fase 6).

- Cartão de intro: `FASE 5` · `MARGINAL DE SÃO PAULO` · subtítulo `DE UBER ATÉ O GALPÃO`.
- `theme: 'uber'`, `autoscroll: true`, `levelIndex = 4`. `?fase=5` abre direto.

## 2. Pilares de design

1. **Linear de verdade.** Uma pista só, sem rota alternativa, sem plataformas, sem nada para escalar. Tudo vem da direita em direção ao Pardo.
2. **Três respostas, sempre legíveis.** Cada ameaça pede **PULE**, **SOQUE** ou **NÃO PULE**. O jogador decide pela silhueta e pela altura em que a coisa vem, nunca por tentativa e erro.
3. **Todo inimigo morre com 1 soco.** Sem exceção, sem blindado, sem atordoamento.
4. **Ritmo de música.** A fase é escrita em compassos: obstáculos e encontros caem nos tempos da trilha (150 BPM). A dificuldade sobe pela densidade, não pela velocidade.
5. **Fecha só com pulo e soco.** O direcional é expressão e conforto; a fase inteira é vencível sem tocar nele.

## 3. Referências e o que tiramos de cada uma

| Referência | O que entra | O que fica de fora |
|---|---|---|
| **Mega Man X4 — Jet Stingray** | Velocidade constante, ondas de inimigos de 1 golpe vindo de frente, barreiras destrutíveis no reflexo, liberdade de avançar/recuar na tela, cenário que muda de trecho em trecho, clímax com um veículo maior à frente | Tiro à distância e dash (o Pardo só tem o soco, curto) |
| **Donkey Kong Country — Mine Cart** | Leitura de "pule agora" com antecedência, obstáculos altos que punem o pulo por reflexo, arcos de moedas desenhando a trajetória do pulo, saltos espetaculares sobre vãos, fase curta e memorizável | Morte com 1 toque e queda no abismo (aqui há 3 gotas e checkpoints) |

## 4. Mecânica central

### 4.1. Pardo e Uber são uma unidade

- O Pardo fica em pé no **teto do carro** (`uber_car`, 64×24). Horizontalmente os dois andam **juntos**: o carro está sempre centrado sob o Pardo, inclusive no ar. Pular e cair de volta no teto é garantido; não existe "cair do carro".
- O carro é **invulnerável** e é só o chão do Pardo. Nada do cenário colide com o carro. Não há tiles sólidos acima da pista em lugar nenhum da fase: tudo o que ameaça o Pardo é entidade que **fere e atravessa**, nunca parede. Isso elimina esmagamento contra a borda da tela.
- O Pardo olha sempre para a frente (`facing = +1` travado). Nada vem por trás.

### 4.2. Rolagem e controle

| Parâmetro | Valor | Observação |
|---|---|---|
| Velocidade da rolagem (`UBER.speed`) | **120 px/s** = 7,5 colunas/s | Constante do início ao fim (antes era 80) |
| Andamento da trilha | 150 BPM → 1 tempo = 0,4 s = **3 colunas** | 1 compasso (4 tempos) = 1,6 s = **12 colunas** |
| Acelerar / frear (`→` / `←`) | ±40 px/s em relação à rolagem | Velocidade de aproximação fica entre 80 e 160 px/s |
| Faixa do Pardo na tela | centro entre x = 48 e x = 176 | Posição neutra x = 72; sobram ≥ 144 px de visão à frente |
| Pulo | mesmo envelope das outras fases (`PHYS`) | Ápice 50 px, 0,67 s no ar = 5 colunas na posição neutra |
| Soco | mesmo soco das outras fases | Alcance 18 px à frente, ativo por 0,10 s, total 0,22 s |
| Câmera Y | travada | Mapa de 12 linhas (192 px), `camera.y = 12` |

Sem direcional, o Pardo fica parado na tela e o mundo passa a 120 px/s. `→` aproxima do perigo (mais pontos de moeda, menos tempo de reação), `←` compra tempo.

### 4.3. As duas faixas de altura

Com a pista na linha 10 e o teto do Uber em `y = 144`:

| Faixa | Linha · y | Quem acerta | Resposta |
|---|---|---|---|
| **ALTA** | linha 5 · 80–96 | Só o Pardo que pulou (cabeça entra aqui com pulo > 28 px) | **NÃO PULE** (ou soco no ar, se for inimigo) |
| livre | linha 6–7 · 96–128 | Ninguém | Arcos de moedas |
| **BAIXA** | linha 8 · 128–144 | O Pardo em pé (hitbox 124–144) | **PULE** se for obstáculo, **SOQUE** se for inimigo ou barreira |

Regras que derivam do envelope de pulo (contrato para o level design, verificadas pelo validador):

- Obstáculo de pular tem **1 tile de altura** e no máximo **2 colunas** de largura. Na posição neutra, o de 1 coluna aceita decolagem numa janela de 0,33 s; o de 2 colunas, 0,20 s.
- Nunca há obstáculo de pular e obstáculo alto na mesma coluna. O pulo mínimo (toque curto, ≈ 16 px) não passa com folga entre os dois.
- Coisa na faixa baixa embaixo de coisa na faixa alta só pode ser algo que morre no soco. É o padrão **"soco obrigatório"**.

### 4.4. Janela do soco

O soco acerta se o alvo entrar nos 18 px à frente do Pardo durante os 0,10 s ativos. A janela para apertar o botão vale aproximadamente `18 / v + 0,10` s, onde `v` é a velocidade de aproximação:

| Alvo | Aproximação (neutro) | Janela | No pior caso (acelerando) |
|---|---|---|---|
| Barreira, pichador (parados no mundo) | 120 px/s | 0,25 s | 0,21 s |
| Patinete (anda no mesmo sentido, devagar) | 80 px/s | 0,33 s | 0,25 s |
| Drone em rasante, motoboy | 180 px/s | 0,20 s | 0,18 s |
| Motoboy rápido, caixa arremessada | 220 px/s | 0,18 s | 0,17 s |

Piso de contrato: **nenhuma janela abaixo de 0,15 s (9 quadros)**.

### 4.5. Dano, cura e morte

- Tocar em obstáculo ou inimigo: **−1 gota** (de 3), sem empurrão horizontal, com um pequeno tranco vertical e **1,0 s** de invulnerabilidade (nas outras fases são 1,5 s; aqui 1,5 s deixaria atravessar um compasso e meio de graça).
- **Isopor do ambulante** (`W`): socar dá **+1 gota** na hora. Não fere se errar.
- 0 gotas: perde uma vida e volta ao último checkpoint.
- **Checkpoints por passagem** (`K`): contam ao cruzar a coluna, sem precisar tocar em nada. O compasso do checkpoint é sempre vazio de ameaças, então o renascimento começa com 1,6 s de fôlego.
- Não há abismo nem tile letal. A única forma de morrer é ficar sem gotas.

### 4.6. Saltos de rampa

Três vezes na fase a pista acaba numa rampa de obra e o Uber **voa um compasso inteiro** (12 colunas, 1,6 s) sobre o vão, num arco de 40 px de altura, com o Pardo no teto. É automático: é o momento de espetáculo e de respiro, com um grande arco de moedas para pegar pulando e nenhuma ameaça. Cada rampa marca a troca de cenário.

### 4.7. Avaliação da corrida

A corrida começa com **5 estrelas**; cada gota perdida tira uma (mínimo 1). Na tela de vitória aparece `AVALIAÇÃO DA CORRIDA ★★★★☆` e o bônus é `500 × estrelas`. Dá motivo para rejogar uma fase que dura menos de 2 minutos.

## 5. Vocabulário da fase

Detalhes de sprite, hitbox e comportamento em [`gdd_bestiario_fase5.md`](gdd_bestiario_fase5.md).

| Resposta | Elemento | Estreia |
|---|---|---|
| **PULE** | Limitador de altura (barra zebrada "2,0 m", 1 coluna) | Intro |
| **PULE** | Faixa de obra (2 colunas) | Ato 2 |
| **NÃO PULE** | Placa de pórtico (3 colunas) | Ato 1 |
| **NÃO PULE** | Luminária de túnel (1 coluna, em série) | Ato 3 |
| **SOQUE** (ou pule) | Barreira laranja da CET | Ato 1 |
| **SOQUE** (ou pule) | Motoboy do grau; depois o motoboy rápido | Ato 1 · Ato 3 |
| **SOQUE** em sequência | Fila de Faria Limers de patinete | Ato 2 |
| **SOQUE** (em pé no rasante, ou no ar antes dele) | Drone de delivery | Ato 1 |
| **PULE + SOQUE** | Pichador de rapel | Ato 2 |
| **SOQUE** / **NÃO PULE** | Caixas do caminhão-baú (baixas e altas) | Ato 4 |

## 6. Estrutura

74 compassos = 888 colunas = **1 min 58 s** de rolagem. Frases de 4 compassos: três de ação e um de respiro com moedas. A partitura completa está em [`level_design_fase5.md`](level_design_fase5.md).

| Trecho | Compassos | Cenário | O que ensina / cobra | Densidade |
|---|---|---|---|---|
| Embarque | 1–4 | Acostamento da Marginal, noite | Andar, primeiro pulo com placa de tutorial | — |
| **Ato 1 — Marginal Tietê** | 5–20 | Rio e marginais à noite, neon | Um verbo por vez: pular, socar, não pular. Estreia motoboy e drone | 1 decisão por compasso |
| Rampa 1 + checkpoint 1 | 21–22 | Subida para o elevado | Respiro | — |
| **Ato 2 — Minhocão** | 23–38 | Elevado entre prédios, janelas acesas | Combinações de dois verbos. Estreia patinete, pichador e soco obrigatório | 2 por compasso |
| Rampa 2 + checkpoint 2 | 39–40 | Salto do fim do elevado para a boca do túnel | Respiro | — |
| **Ato 3 — Túnel** | 41–56 | Túnel com luminárias em série | Trechos longos sem poder pular: soco no tempo da música. Estreia motoboy rápido | até 3 por compasso |
| Checkpoint 3 | 57–58 | Saída do túnel, amanhecendo | Respiro + isopor | — |
| **Ato 4 — Ponte Estaiada** | 59–70 | Ponte ao amanhecer, caminhão-baú da transportadora à frente | Tudo misturado, mais as caixas arremessadas | até 3 por compasso |
| Rampa 3 + desembarque | 71–74 | Salto final e portaria da Transportadora | Pacífico; totem `UBER 5★` | — |

O **caminhão-baú** do Ato 4 é o clímax no lugar de um chefe: fica preso à direita da tela por 8 compassos, com a porta traseira aberta, perdendo caixas no ritmo. Não tem vida nem é derrotado; no fim pega a saída `TRANSPORTADORA →`, que é para onde o Pardo vai na Fase 6.

## 7. Direção de arte, cenário e som

- **Parallax em quatro trechos** (`background5.ts`), trocando nas rampas: (1) Marginal à noite com o Tietê refletindo neon; (2) Minhocão com prédios colados e grafites; (3) túnel de azulejos com faixa de luz correndo; (4) Ponte Estaiada com o céu virando laranja. A passagem do escuro para o amanhecer é o relógio da fase.
- **Leitura acima de tudo.** Obstáculo de pular é sempre **zebrado amarelo e preto**; coisa alta que pune pulo é sempre **verde de placa** ou **luz branca**; tudo o que morre no soco tem **contorno claro e algo laranja ou vermelho**. Três famílias de cor, uma por resposta.
- **Sensação de velocidade:** faixas da pista e postes correndo, poeira e faísca nas rodas, cone de luz dos faróis, linhas de vento nas camadas de primeiro plano.
- **Trilha `'uber'`:** chiptune rock a **150 BPM em 4/4**, frases de 4 compassos. O andamento é contrato do level design. Ao renascer num checkpoint a música recomeça do início de uma frase.
- **SFX:** `rev` (motoboy entrando na tela), `beep` (drone travando a mira), `horn` (caminhão-baú e chegada), `crate` (caixa socada), `break` (barreira).

## 8. Final da fase

No compasso 72 a rolagem desacelera até parar na portaria. O Pardo toca o totem `UBER 5★` (`uber_goal`), buzina dupla, bebe a água de cortesia. Tela `FASE 5 CONCLUÍDA!`: carro, Pardo bebendo, contadores, **avaliação em estrelas**, frase `O PARDO CHEGOU DE UBER` e `ENTER OU TOQUE PARA A FASE 6`.

## 9. Fora de escopo

Chefe com barra de vida, troca de pista em profundidade, tiro, queda em abismo, rotas alternativas, plataformas móveis, coolers e blocos `?`. Tudo isso existia ou foi cogitado na versão anterior e sai de propósito.

**Decisão registrada (18/11/2026): o carro fica preso à pista.** Foi avaliado o veículo livre no plano 2D, como o Tornado em *Sky Chase Zone* (Sonic 2), e descartado: com movimento vertical livre o soco de 18 px e o pulo perdem função, o Uber teria de voar e os encontros deixam de cair no tempo da música. Do Sky Chase fica só a ideia de personagem e veículo andarem como uma unidade (§4.1) e o espetáculo dos saltos de rampa (§4.6).
