# Bestiário, obstáculos e carro da Uber — *Fase 5: Marginal de São Paulo*

> **Versão 2 (18/11/2026).** Referência de entidades para `src/game/enemies5.ts`, `src/game/objects5.ts`, `src/gfx/art/enemies5.ts` e `src/gfx/art/uber.ts`.
> Regra de ouro: **todo inimigo morre com 1 soco.** Regra de leitura: **zebrado amarelo e preto = pule · verde de placa ou luz branca = não pule · contorno claro com laranja ou vermelho = soque.**
> Mecânica geral em [`gdd_fase5_marginal.md`](gdd_fase5_marginal.md); posição de cada coisa em [`level_design_fase5.md`](level_design_fase5.md).

Coordenadas usadas abaixo: teto do Uber em `y = 144`; Pardo em pé ocupa `y = 124–144`; **faixa baixa** = `y 128–144`; **faixa alta** = `y 80–96`.

---

## 1. Posição em função da câmera

Nesta fase nenhum inimigo tem IA reativa. A posição de cada um é uma **função pura de `camera.x`**, como num rail shooter:

```
x = encontroX + (vPropria / 120) × (encontroX − (camera.x + 72))
```

- `encontroX` é a coluna do marcador no mapa: o ponto em que o inimigo cruza o Pardo **na posição neutra** (x de tela = 72).
- `vPropria` é a velocidade do inimigo contra o fluxo (positiva = vem de frente; negativa = anda no mesmo sentido do Uber, mais devagar).
- Consequências: o mapa ASCII mostra onde o encontro acontece, os encontros caem no tempo da música, renascer num checkpoint reproduz a fase idêntica e o validador simula tudo sem rodar IA.
- Acelerar ou frear muda a hora do encontro, e isso é a utilidade tática do direcional.

Um inimigo socado é arremessado girando para cima e para a direita, com `hit`, pontos flutuantes e `fx('impact')`. Contato sem soco: `player.hurt` (−1 gota) e o inimigo **continua** o caminho.

## 2. O carro preto da Uber (`uber_car`, 64×24, 2 quadros)

- **Arte:** sedã executivo **preto** com reflexos cinza no capô, teto e para-lamas; **`UBER` em branco** na porta, legível em movimento; **motorista visível** pela janela dianteira (rosto, mãos no volante, celular com GPS aceso no painel). Quadro 0/1: rodas girando, vibração do para-choque, brilho dos faróis.
- **Mecânica:** plataforma com teto em `y = 144` (rodas afundam 8 px no tile da pista, como hoje). `x` travado ao centro do Pardo, inclusive no ar. Invulnerável, não colide com nada.
- **Efeitos:** cone de luz dos faróis, lanterna traseira, poeira e faísca nas rodas, e uma **inclinação visual** de ±2 px ao acelerar ou frear. Nas rampas o carro segue o arco (§5) e as rodas param de soltar poeira.
- A arte atual do carro pode ser reaproveitada se passar na revisão do preview; a mecânica é reescrita.

## 3. Inimigos (1 soco cada)

| Kind | Marcador | Nome | Sprite | Hitbox | Faixa | `vPropria` | Pontos |
|---|---|---|---|---|---|---|---|
| `motoboy` | `y` | Motoboy do Grau | `motoboy [28,22,2]` | 22×18 | baixa | +60 | 300 |
| `motoboy` (rápido) | `Y` | Motoboy do Corredor | `motoboy_fast [28,22,2]` | 22×18 | baixa | +100 | 400 |
| `patinete` | `p` | Faria Limer de Patinete | `patinete [20,24,2]` | 14×20 | baixa | −40 | 200 |
| `drone` | `u` | Drone de Delivery | `drone [20,16,2]`, `drone_dive [20,16,1]` | 16×12 | alta → baixa | +30 / +80 | 250 |
| `pichador` | `z` | Pichador de Rapel | `pichador_rapel [20,32,2]`, `spray_cloud [16,32,2]` | 12×20 | alta (corpo) + baixa (spray) | 0 | 350 |

### 3.1. Motoboy do Grau (`y`) e Motoboy do Corredor (`Y`)

- **Visual:** capacete fechado, jaqueta preta e vermelha, moto vermelha com baú térmico, **sempre empinando**, roda dianteira na altura do peito do Pardo, faísca na rabeta e farol aceso. O rápido tem jaqueta amarela, farol alto piscando e rastro de vento.
- **Comportamento:** vem em linha reta pelo corredor, na faixa baixa. Toca `rev` ao entrar na tela (1,35 s antes do encontro; 1,1 s no rápido).
- **Resposta:** soco (janela 0,20 s; 0,18 s no rápido) ou pulo por cima. Sob placa ou luminária, só o soco.
- **Papel:** teste de reflexo. É o inimigo-base da fase.

### 3.2. Faria Limer de Patinete (`p`)

- **Visual:** camisa social azul-clara, colete puffer preto, calça bege, óculos escuros, patinete elétrico verde-neon, olhando para o celular.
- **Comportamento:** anda no mesmo sentido do Uber, mais devagar; o Uber vai alcançando. Fica 3 s na tela, sempre visível com muita antecedência. Vem em **fila indiana de 2 a 4**, com 2 colunas entre cada um, o que dá um por tempo da música.
- **Resposta:** um soco por tempo. A fila é longa demais para pular por cima (3 patinetes levam 1,1 s para passar; o pulo dura 0,67 s).
- **Papel:** soco em ritmo. É o inimigo que faz o jogador sentir a trilha.

### 3.3. Drone de Delivery (`u`)

- **Visual:** quadricóptero amarelo e preto, quatro rotores, visor de LED vermelho, caixinha pendurada. Em `drone_dive` inclina 30° com o visor piscando.
- **Comportamento em três tempos, todos em função da câmera:**
  1. **Pairando** na faixa alta (centro `y = 88`) desde que entra na tela.
  2. **Aviso:** a 2 tempos do encontro (0,8 s) trava no ar por 0,3 s, pisca e toca `beep`.
  3. **Rasante:** desce em diagonal até a faixa baixa em 0,3 s e voa reto os 0,2 s finais. O encontro acontece na faixa baixa, em cima do tempo.
- **Resposta:** esperar e socar em pé no rasante (janela 0,20 s), ou pular e **socar no ar** enquanto ele ainda paira. Pular sem socar enquanto ele paira dá dano.
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
| `G` | Placa de pórtico (3 colunas) | `obst_placa [48,32,1]` + `portico_post [16,96,1]` | 44×16 na faixa alta | **NÃO PULE** |
| `i` | Luminária de túnel | `obst_luminaria [16,16,2]` | 12×12 na faixa alta | **NÃO PULE** |

- **Limitador:** barra **zebrada amarela e preta** entre dois postes nas laterais da pista, com a plaquinha `2,0 m`. O carro passa por baixo; o Pardo, não. Só a barra fere; os postes são decoração.
- **Faixa de obra:** cavalete duplo com lona `OBRAS — CET`, também zebrado.
- **Placa de pórtico:** placa **verde** de destino (`TIETÊ`, `CASTELO BRANCO`, `CENTRO`, `TRANSPORTADORA →`) pendurada num pórtico. O texto varia por posição.
- **Luminária:** calha de **luz branca** pendurada do teto do túnel, pulsando. Aparece em série, marcando os tempos.

As zonas que ferem são alguns pixels menores que o desenho, de propósito: na dúvida, o jogador passa.

## 5. Objetos

| Marcador | Objeto | Sprite | Comportamento |
|---|---|---|---|
| `B` | Barreira da CET | `barreira_cet [16,16,2]` | Na faixa baixa. Fere ao toque, **quebra com 1 soco** (+50, `break`, `fx('debris')`). Também dá para pular. Laranja com faixas brancas. |
| `W` | Isopor do ambulante | `isopor_agua [16,24,2]` | Isopor `ÁGUA 2 REAL` num suporte na mureta, na faixa baixa. Não fere. Soco: **+1 gota**, `water`, `fx('splash')`, quadro 1 (aberto). |
| `c` | Moeda | (existente) | Presa ao mundo. Linhas baixas e arcos na trajetória do pulo. |
| `K` | Checkpoint | `marginal_sign` (placa de km acesa) | Conta ao cruzar a coluna. Decoração na mureta, não colide. |
| `J` | Rampa | `rampa_obra [32,16,1]` | Início de um salto: o teto do carro sobe `40 × 4u(1−u)` px ao longo de 12 colunas (`u` de 0 a 1). O Pardo fica grudado no teto enquanto está no chão. Sem pista embaixo; o Tietê ou a cidade aparecem no vão. |
| `T` | Caminhão-baú | `truck_bau [80,48,2]` | Entra pela direita com `horn`, fica preso em x de tela = 232 por 8 compassos, porta traseira aberta, balançando. Sem colisão, sem vida. Sai acelerando pela saída `TRANSPORTADORA →`. Baú com o logotipo da transportadora da Fase 6. |
| `A` | Desembarque 5★ | `uber_goal [32,40,2]` | Totem luminoso `UBER 5★`. Toque → `world.win()`, `horn` + `deliver`, Pardo bebe a água de cortesia (`'mineral'`). |
| `t` | Placa de tutorial | `tutorial_sign [24,24,3]` | Pictogramas `PULE`, `SOQUE`, `NÃO PULE` (quadros 0–2), 4 colunas antes da primeira ocorrência de cada verbo. Decoração. |

Decoração da mureta (não colide): `street_light`, `speed_radar`, `traffic_cone`, grafites e janelas ficam com o parallax e com a linha 11 do mapa.

## 6. Sprites que saem

`motoboy_wheelie`, `patinete_jump`, `pichador`, `pichador_throw`, `lata`, `cooler_uber`, `platform_drone`, `platform_beam`, `bus_front`, `bus_wheels`, `tile_ub_rock`, `tile_ub_spike`, `tile_ub_block`, `tile_ub_block_item` e `tile_ub_oneway` deixam de existir junto com as mecânicas que serviam. Ficam `tile_ub_top` (asfalto) e `tile_ub_ground` (mureta e pilares).
