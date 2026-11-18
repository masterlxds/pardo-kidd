# Bestiário, obstáculos e carro da Uber — *Fase 5: Marginal de São Paulo*

> **Versão 2 (18/11/2026).** Referência de entidades para `src/game/enemies5.ts`, `src/game/objects5.ts`, `src/gfx/art/enemies5.ts` e `src/gfx/art/uber.ts`.
> Regra de ouro: **todo inimigo morre com 1 soco.** Regra de leitura: **zebrado amarelo e preto = pule · verde de placa ou luz branca = não pule · contorno claro com laranja ou vermelho = soque.**
> Mecânica geral em [`gdd_fase5_marginal.md`](gdd_fase5_marginal.md); posição de cada coisa em [`level_design_fase5.md`](level_design_fase5.md).

> **Revisão de 18/11/2026 (2ª rodada):** sem direcional; motoboys e patinetes no asfalto, com salto no encontro; saco de entulho no lugar da barreira da CET; zonas maiores na placa e na luminária; cutscene de chegada. Os números valem como estão em `src/game/uberRules.ts`.

Coordenadas usadas abaixo: teto do Uber em `y = 144`; Pardo em pé ocupa `y = 124–144`; **faixa baixa** = `y 128–144`; **faixa alta** = `y 80–96`; **asfalto** (onde as rodas encostam) = `y = 168` (`UBER.groundY`).

---

## 1. Posição em função da câmera

Nesta fase nenhum inimigo tem IA reativa. A posição de cada um é uma **função pura de `camera.x`**, como num rail shooter:

```
x = encontroX + (vPropria / 120) × (encontroX − (camera.x + 72))
```

- `encontroX` é a coluna do marcador no mapa: o ponto em que o inimigo cruza o Pardo, cujo centro fica **fixo em x de tela = 72** (`UBER.screenNeutral`).
- `vPropria` é a velocidade do inimigo contra o fluxo (positiva = vem de frente; negativa = anda no mesmo sentido do Uber, mais devagar).
- Consequências: o mapa ASCII mostra onde o encontro acontece, os encontros caem no tempo da música, renascer num checkpoint reproduz a fase idêntica e o validador simula tudo sem rodar IA.
- Não há direcional: a hora de cada encontro é fixa, e é isso que permite o salto abaixo cair sempre no ponto certo.

**Salto (motoboy, motoboy rápido e patinete).** Quem tem roda vem **pelo asfalto**, com a base da hitbox em `y = 168`, abaixo do teto do carro: ali não fere o Pardo nem é alcançado pelo soco. Ao chegar perto, salta. A base da hitbox, também função pura da câmera (`uberEnemyBottom`), é:

```
t = (encontroX − (camera.x + 72)) / 120          segundos até o encontro
base = 168 − hopLift × (1 − (t / hopT)²)          enquanto |t| < hopT; fora disso, base = 168
```

| Kind | `hopLift` | `hopT` | Decola a | No ar |
|---|---|---|---|---|
| `motoboy` | 26 px | 0,40 s | 72 px do Pardo | 0,80 s |
| `motoboy_fast` | 26 px | 0,35 s | 77 px do Pardo | 0,70 s |
| `patinete` | 26 px | 0,60 s | 48 px do Pardo | 1,20 s |

O ápice é exatamente o encontro (`t = 0`), com a base em `y = 142`: o inimigo cruza o Pardo na altura do peito, passa por cima do capô e do porta-malas do Uber e pousa atrás do carro. `uberEnemyHopping` diz se ele está no ar, para trocar o sprite e soltar poeira na decolagem e no pouso. Drone, pichador e caixas não saltam (`hopLift = 0`).

Um inimigo socado é arremessado girando para cima e para a direita, com `hit`, pontos flutuantes e `fx('impact')`. Contato sem soco: `player.hurt` (−1 gota) e o inimigo **continua** o caminho.

## 2. O carro preto da Uber (`uber_car`, 64×24, 2 quadros)

- **Arte:** sedã executivo **preto** com reflexos cinza no capô, teto e para-lamas; **`UBER` em branco** na porta, legível em movimento; **motorista visível** pela janela dianteira (rosto, mãos no volante, celular com GPS aceso no painel). Quadro 0/1: rodas girando, vibração do para-choque, brilho dos faróis.
- **Mecânica:** plataforma com teto em `y = 144` (rodas afundam 8 px no tile da pista, como hoje). `x` travado ao centro do Pardo, inclusive no ar. Invulnerável, não colide com nada.
- **Efeitos:** cone de luz dos faróis, lanterna traseira, poeira e faísca nas rodas. Não há inclinação por direcional (ele não existe): o carro fica no mesmo x de tela a fase inteira. Nas rampas o carro segue o arco (§5) e as rodas param de soltar poeira; na cutscene de chegada (§5, `A`) ele avança sozinho até o totem.
- A arte atual do carro pode ser reaproveitada se passar na revisão do preview; a mecânica é reescrita.

## 3. Inimigos (1 soco cada)

| Kind | Marcador | Nome | Sprite | Hitbox | Faixa | `vPropria` | Pontos |
|---|---|---|---|---|---|---|---|
| `motoboy` | `y` | Motoboy do Grau | `motoboy [28,22,2]`, `motoboy_jump [28,22,1]` | 22×18 | asfalto → baixa (salto) | +60 | 300 |
| `motoboy` (rápido) | `Y` | Motoboy do Corredor | `motoboy_fast [28,22,2]`, `motoboy_fast_jump [28,22,1]` | 22×18 | asfalto → baixa (salto) | +100 | 400 |
| `patinete` | `p` | Faria Limer de Patinete | `patinete [20,24,2]`, `patinete_jump [20,24,1]` | 14×20 | asfalto → baixa (salto) | −40 | 200 |
| `drone` | `u` | Drone de Delivery | `drone [20,16,2]`, `drone_dive [20,16,1]` | 16×12 | alta → baixa | +30 / +80 | 250 |
| `pichador` | `z` | Pichador de Rapel | `pichador_rapel [20,32,2]`, `spray_cloud [16,32,2]` | 12×20 | alta (corpo) + baixa (spray) | 0 | 350 |

### 3.1. Motoboy do Grau (`y`) e Motoboy do Corredor (`Y`)

- **Visual:** capacete fechado, jaqueta preta e vermelha, moto vermelha com baú térmico, **rodando no asfalto** com as duas rodas no chão, farol aceso e faísca na rabeta. O rápido tem jaqueta amarela, farol alto piscando e rastro de vento. No salto troca para `motoboy_jump` / `motoboy_fast_jump`: moto empinada no ar, roda dianteira no alto.
- **Comportamento:** vem em linha reta pelo corredor, **colado no chão** (base em `y = 168`). Toca `rev` ao entrar na tela (1,35 s antes do encontro; 1,1 s no rápido). A 0,40 s do encontro (0,35 s no rápido) **decola** com poeira, cruza o Pardo no ápice do salto, na altura do peito, e pousa atrás do carro (§1).
- **Resposta:** soco (janela 0,20 s = 12 quadros; 0,18 s = 11 quadros no rápido) ou pulo por cima (20 e 22 quadros de decolagem). Sob placa ou luminária, só o soco. A decolagem é o aviso: quem soca logo depois de vê-lo sair do chão acerta.
- **Papel:** teste de reflexo. É o inimigo-base da fase.

### 3.2. Faria Limer de Patinete (`p`)

- **Visual:** camisa social azul-clara, colete puffer preto, calça bege, óculos escuros, patinete elétrico verde-neon, olhando para o celular.
- **Comportamento:** anda no mesmo sentido do Uber, mais devagar, **pelo asfalto**; o Uber vai alcançando. Fica 3 s na tela, sempre visível com muita antecedência. Vem em **fila indiana de 2 a 4**, com 2 colunas entre cada um, o que dá um por tempo da música. Quando o carro encosta, cada um puxa o guidão e **salta por cima do Uber** (`patinete_jump`), 0,6 s antes do próprio encontro: a fila salta **um a um**, no tempo da música, nunca todos juntos.
- **Resposta:** um soco por tempo (janela 0,33 s = 20 quadros). Um patinete sozinho ainda dá para pular por cima (14 quadros de decolagem); a fila é longa demais (3 patinetes levam 1,1 s para passar; o pulo dura 0,67 s).
- **Papel:** soco em ritmo. É o inimigo que faz o jogador sentir a trilha.

### 3.3. Drone de Delivery (`u`)

- **Visual:** quadricóptero amarelo e preto, quatro rotores, visor de LED vermelho, caixinha pendurada. Em `drone_dive` inclina 30° com o visor piscando.
- **Comportamento em três tempos, todos em função da câmera:**
  1. **Pairando** na faixa alta (centro `y = 88`) desde que entra na tela.
  2. **Aviso:** a 2 tempos do encontro (0,8 s) trava no ar por 0,3 s, pisca e toca `beep`.
  3. **Rasante:** desce em diagonal até a faixa baixa em 0,3 s e voa reto os 0,2 s finais. O encontro acontece na faixa baixa, em cima do tempo.
- **Resposta:** esperar e socar em pé no rasante (janela 0,20 s = 12 quadros), ou pular por cima dele quando já desceu (26 quadros de decolagem). Com o Pardo fixo em x de tela = 72, **não existe** soco no ar enquanto ele paira: no aviso o drone está parado a 100 px do Pardo e o soco alcança 18 px. Pular cedo demais dá dano na descida.
- **Papel:** ameaça que muda de faixa. Ensina a não pular por reflexo.

### 3.4. Pichador de Rapel (`z`)

- **Visual:** moletom roxo com capuz, boné para trás, lenço no rosto, **pendurado por uma corda** num pórtico, viaduto ou estai, com a lata de spray apontada para baixo. A corda sobe até sair da tela.
- **Comportamento:** preso ao mundo. Corpo na faixa alta (`y = 88–108`). Solta uma **nuvem de spray contínua** logo abaixo (`spray_cloud`, 16×32, `y = 112–144`), que fere quem passa em pé.
- **Resposta:** **pular e socar no ar** (janela 0,25 s; o Pardo passa 0,52 s na altura certa). Ficar em pé leva o spray; pular sem socar bate nele. Derrotado, a nuvem some na hora.
- **Papel:** a prova do soco aéreo. É o único inimigo sem alternativa.

### 3.5. Caixas do caminhão-baú (`x` baixa, `X` alta)

- **Sprite:** `caixa [12,12,2]` (papelão com fita e etiqueta `FRÁGIL`, girando). Hitbox 10×10. `vPropria = +100`. +50 pontos, som `crate`.
- **Origem:** saem da porta traseira do caminhão-baú (§5) no instante em que a posição calculada coincide com a porta, numa reta na faixa baixa (`x`) ou na faixa alta (`X`).
- **Resposta:** `x` é soco ou pulo; `X` é não pular (ou soco no ar).

## 4. Obstáculos (não morrem; ferem e atravessam)

| Marcador | Nome | Sprite | Zona que fere | Resposta |
|---|---|---|---|---|
| `L` | Limitador de altura `2,0 m` | `obst_limitador [16,48,1]` | 12×12 na faixa baixa | **PULE** |
| `F` | Faixa de obra | `obst_faixa [32,48,1]` | 28×12 na faixa baixa | **PULE** (mais cedo) |
| `G` | Placa de pórtico (3 colunas) | `obst_placa [48,32,1]` + `portico_post [16,96,1]` | 44×28, `y 82–110` | **NÃO PULE** |
| `i` | Luminária de túnel | `obst_luminaria [16,16,2]` | 12×14, `y 96–110` | **NÃO PULE** |

- **Limitador:** barra **zebrada amarela e preta** entre dois postes nas laterais da pista, com a plaquinha `2,0 m`. O carro passa por baixo; o Pardo, não. Só a barra fere; os postes são decoração.
- **Faixa de obra:** cavalete duplo com lona `OBRAS — CET`, também zebrado.
- **Placa de pórtico:** placa **verde** de destino (`TIETÊ`, `CASTELO BRANCO`, `CENTRO`, `TRANSPORTADORA →`) pendurada num pórtico. O texto varia por posição.
- **Luminária:** calha de **luz branca** pendurada do teto do túnel, pulsando. Aparece em série, marcando os tempos.

As zonas que ferem dos obstáculos de pular são alguns pixels menores que o desenho, de propósito: na dúvida, o jogador passa.

**As zonas altas descem até `y = 110`, de propósito.** O Pardo em pé (topo em `y = 124`) passa com 14 px de folga, mas nem o pulo mínimo (toque curto, ≈ 16 px) cabe por baixo. É isso que torna o **soco obrigatório** realmente obrigatório: com as zonas antigas (44×16 e 12×12, só na faixa alta) um pulinho baixo passava por cima do alvo e por baixo da placa. O validador confere: nas 9 ocorrências de alvo sob `G` ou `i`, nenhuma decolagem atravessa sem dano. **Requisito de arte:** o desenho precisa descer até perto dessa altura (placa posicionada com a borda inferior em `y ≈ 112`; cone de luz visível embaixo da calha da luminária), para ninguém levar dano de algo que não enxerga.

## 5. Objetos

| Marcador | Objeto | Sprite | Comportamento |
|---|---|---|---|
| `B` | Saco de entulho | `saco_entulho [16,24,2]` | **Saco laranja de entulho pendurado num guincho de obra**, com a corrente subindo até o topo da tela, balançando de leve. Zona 14×16 na faixa baixa (`UBER_SACO`, kind `saco_entulho`, fábrica `createSaco`). Fere ao toque, **estoura com 1 soco** (+50, `break`, `fx('debris')`). Também dá para pular (22 quadros de decolagem); sob placa ou luminária é soco obrigatório. Substitui a barreira laranja da CET, que parecia flutuar. |
| `W` | Isopor do ambulante | `isopor_agua [16,24,2]` | Isopor `ÁGUA 2 REAL` num suporte na mureta, na faixa baixa. Não fere. Soco: **+1 gota**, `water`, `fx('splash')`, quadro 1 (aberto). |
| `c` | Moeda | (existente) | Presa ao mundo. Linhas baixas e arcos na trajetória do pulo. |
| `K` | Checkpoint | `marginal_sign` (placa de km acesa) | Conta ao cruzar a coluna. Decoração na mureta, não colide. |
| `J` | Rampa | `rampa_obra [32,16,1]` | Início de um salto: o teto do carro sobe `40 × 4u(1−u)` px ao longo de 12 colunas (`u` de 0 a 1). O Pardo fica grudado no teto enquanto está no chão. Sem pista embaixo; o Tietê ou a cidade aparecem no vão. |
| `T` | Caminhão-baú | `truck_bau [80,48,2]` | Entra pela direita com `horn`, fica preso em x de tela = 232 por 8 compassos, porta traseira aberta, balançando. Sem colisão, sem vida. Sai acelerando pela saída `TRANSPORTADORA →`. Baú com o logotipo da transportadora da Fase 6. |
| `A` | Desembarque 5★ | `uber_goal [32,40,2]` | Totem luminoso `UBER 5★` com a **garrafa d'água de cortesia**. É o destino da **cutscene de chegada**: a rolagem freia ao longo de 1,5 compasso (`UBER.stopBars`) e para; o jogador perde o controle; o carro avança sozinho (até `UBER.arriveSpeed` = 90 px/s) até encostar no totem; `horn` + `deliver`; o Pardo desce e bebe a água (`'mineral'`) → `world.win()`. |
| `t` | Placa de tutorial | `tutorial_sign [24,24,3]` | Pictogramas `PULE`, `SOQUE`, `NÃO PULE` (quadros 0–2), 4 colunas antes da primeira ocorrência de cada verbo. Decoração. |

Decoração da mureta (não colide): `street_light`, `speed_radar`, `traffic_cone`, grafites e janelas ficam com o parallax e com a linha 11 do mapa.

## 6. Sprites que saem

`motoboy_wheelie`, `barreira_cet`, `pichador`, `pichador_throw`, `lata`, `cooler_uber`, `platform_drone`, `platform_beam`, `bus_front`, `bus_wheels`, `tile_ub_rock`, `tile_ub_spike`, `tile_ub_block`, `tile_ub_block_item` e `tile_ub_oneway` deixam de existir junto com as mecânicas que serviam. Ficam `tile_ub_top` (asfalto) e `tile_ub_ground` (mureta e pilares).

Sprites que **entram** na 2ª rodada: `motoboy_jump`, `motoboy_fast_jump`, `patinete_jump` (este volta, agora como o quadro de salto do patinete) e `saco_entulho`.
