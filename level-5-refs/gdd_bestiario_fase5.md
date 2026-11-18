# Bestiário, Carro da Uber e Desembarque — *Fase 5: Marginal de São Paulo*

> **Referência de Entidades e Sprites (`src/game/enemies5.ts`, `src/game/objects5.ts`, `src/gfx/art/enemies5.ts`, `src/gfx/art/uber.ts`)**  
> Regra de ouro do autoscroller: **TODOS os inimigos do bestiário desta fase morrem com apenas 1 golpe (1 soco)**!

---

## 1. O Carro Preto da Uber (`uber_car`)

* **Sprite**: `uber_car: [64, 24, 2]` (em `RENDER_SCALE = 2` → **`128×48` pixels reais**, 2 quadros de animação).
* **Direção de Arte**:
  * **Corpo do veículo**: sedã executivo **preto** (`k` no contorno e sombras profundas, `M` e `K` na lataria principal, com linhas de reflexo especular `G`, `g` e `q` desenhando o capô, o teto plano e os para-lamas para destacar claramente contra o asfalto e a noite paulistana).
  * **Inscrição `"UBER"`**: escrita em letras maiúsculas **brancas (`w`)** nítidas na lateral das portas (entre as rodas dianteira e traseira). Na grade 2× (`128×48`), cada letra de `U B E R` tem ~`7×11` pixels reais com traço duplo (`2px`), garantindo leitura imediata em movimento.
  * **Motorista visível**: através da janela dianteira lateral (com fundo azul-petróleo/ciano do painel iluminado `D`, `B`, `0`), vê-se claramente o **motorista do Uber**: cabeça e rosto (`s`, `S`, cabelo `h`), camisa (`w`/`c`), mãos no volante (`K`, `g`) e o celular com GPS aceso (`8`, `c`) no suporte do painel.
  * **Detalhes animados (frame 0 vs. frame 1)**:
    * Rodas com aros prateados (`q`, `Q`, `g`) girando em alta velocidade;
    * Leve vibração esportiva do escapamento/para-choque e brilho dos faróis dianteiros (`y`, `a`, `w`) à direita e lanternas traseiras (`r`, `R`) à esquerda.
* **Mecânica (`createUberCar` em `src/game/objects5.ts`)**:
  * Entidade com `kind: 'uber_car'`, `w: 64, h: 24`, `platform: true`, `dx: 0, dy: 0`.
  * Segue suavemente o `player.centerX` dentro dos limites da câmera, com o teto em `y = 10 * TILE` (`160 px`) sempre que há asfalto (`Tile.GroundTop`) na linha 11 sob o Pardo.
  * Nos vãos do viaduto (colunas sem piso sólido na linha 11), desativa `platform = false` e mergulha visualmente `20 px` pela rampa inferior até o asfalto retornar.
  * Em `draw()`, projeta um cone de luz amarela translúcida dos faróis dianteiros para a direita e solta partículas ocasionais de faísca/poeira nas rodas.

---

## 2. Bestiário da Marginal (Todos com 1 HP / 1 Soco!)

Todos os inimigos são criados via `createUberEnemy(kind, centerX, footY)` em `src/game/enemies5.ts`. Causam `1` de dano de hidratação ao contato (`onTouchPlayer`) e **morrem imediatamente no 1º soco (`onPunch`)**, sendo arremessados girando para fora da tela com som e pontuação.

| Kind | Marcador | Nome | Sprite(s) (`spec.ts`) | Hitbox | Pontos | Golpes p/ Morrer |
|---|---|---|---|---|---|---|
| `'motoboy'` | `y` | Motoboy do Grau | `motoboy [28,22,2]`, `motoboy_wheelie [28,24,1]` | `22×18` | `300` | **1 soco** |
| `'drone'` | `u` | Drone de Delivery | `drone [20,16,2]`, `drone_dive [20,16,1]` | `16×12` | `250` | **1 soco** |
| `'patinete'` | `p` | Faria Limer de Patinete | `patinete [20,24,2]`, `patinete_jump [20,24,1]` | `14×20` | `200` | **1 soco** |
| `'pichador'` | `z` | Pichador do Viaduto | `pichador [20,24,2]`, `pichador_throw [22,24,2]`, `lata [8,8,2]` | `12×20` | `350` (+`10` na lata) | **1 soco** |

### 2.1. Motoboy do Grau (`'motoboy'`, marcador `y`)
* **Visual**: Motoboy paulistano de jaqueta preta/vermelha e capacete fechado sobre moto CG vermelha com baú térmico quadrado nas costas e farol dianteiro aceso. Em `motoboy_wheelie`, a roda dianteira está empinada no ar ("dando grau") com faíscas na rabeta!
* **IA**:
  * Patrulha o trecho de asfalto ou teto de viaduto a `36 px/s` virado para a esquerda (contra o fluxo do Uber).
  * Quando o Pardo entra a `≤ 8 tiles` (`128 px`) de distância horizontal:
    1. **Aviso (`0.32s`)**: para, empina a moto (`motoboy_wheelie`) e toca `world.audio.play('rev')` + `world.fx('dust', ...)`.
    2. **Investida (`0.85s`)**: arranca a `95 px/s` na direção do Pardo mantendo o grau (`motoboy_wheelie`), parando antes de abismos/paredes.
    3. **Retorno**: volta à patrulha normal.
* **Soco**: **1 soco** derrota na hora (`+300 pts`, `sfx: 'hit'`).

### 2.2. Drone de Delivery (`'drone'`, marcador `u`)
* **Visual**: Quadricóptero amarelo/preto/turquesa com 4 rotores brilhantes, visor de LED vermelho frontal e caixinha de entrega pendurada nas garras inferiores. Em `drone_dive`, inclina o chassi a 30° com o visor piscando em alerta máximo.
* **IA**:
  * Nasce flutuando no ar (`footY` = base da célula; centro a `cy = top + TILE / 2 + 8`) e oscila suavemente na vertical (`y = homeY + sin(t * 4) * 5`) enquanto patrulha horizontalmente `±2.5 tiles` a `28 px/s`.
  * Quando o Pardo chega a `≤ 6.5 tiles` (`104 px`) à esquerda do drone:
    1. **Telegrafia (`0.35s`)**: trava no ar com `drone_dive`.
    2. **Rasante (`0.65s`)**: mergulha diagonalmente na direção da posição do Pardo (`vx = -80 px/s`, `vy = 75 px/s`), estilo *Jet Stingray*, e depois retorna suavemente à altitude `homeY`.
* **Soco**: **1 soco** derrota na hora (`+250 pts`, `sfx: 'hit'`, `fx('debris')`).

### 2.3. Faria Limer de Patinete (`'patinete'`, marcador `p`)
* **Visual**: Executivo da Faria Lima de camisa social azul-clara, colete puffer preto sem mangas, calça bege e óculos escuros pilotando um patinete elétrico preto/verde-neon. Em `patinete_jump`, puxa o guidão do patinete no ar num bunny-hop radical!
* **IA**:
  * Desliza pelo trecho a `45 px/s` (respeitando bordas e paredes).
  * Quando o Pardo se aproxima a `≤ 5 tiles` (`80 px`) e o patinete está no chão (com cooldown de `1.2s`):
    * Salta com o patinete (`vy = -215 px/s`, `vx = dir * 65 px/s`, `sfx: 'boing'`, sprite `patinete_jump`) tentando interceptar o pulo do Pardo!
* **Soco**: **1 soco** derrota na hora (`+200 pts`, `sfx: 'hit'`).

### 2.4. Pichador do Viaduto (`'pichador'`, marcador `z`) + Lata de Spray (`'lata'`)
* **Visual**: Pichador urbano de moletom roxo/preto com capuz, boné virado e máscara/lenço, posicionado no alto de passarelas, ônibus e pórticos, segurando uma lata de tinta spray neon.
* **IA**:
  * Fica no seu poleiro elevado virado para o Pardo.
  * Quando o Pardo está a `≤ 8.5 tiles` (`136 px`):
    * Espera `1.4s` → Aviso de `0.4s` erguendo o braço (`pichador_throw` frame 0) → Arremessa uma **`lata`** (`8×8`, `vx = 95 * face`, `vy = -170`, `g = 480`, `sfx: 'throw'`, `pichador_throw` frame 1 por `0.25s`).
  * A **`lata`** causa `1` de dano ao tocar o Pardo, quebra ao bater no cenário, e **pode ser destruída com 1 soco** (`+10 pts`).
* **Soco**: **1 soco** derrota o pichador na hora (`+350 pts`, `sfx: 'hit'`).

---

## 3. Objetos Interativos e Objetivo (`src/game/objects5.ts`)

1. **`createCoolerUber(x, y)` (marcador `V`, sprite `cooler_uber [16, 32, 2]`)**:
   * Cooler térmico azul/preto com adesivo `"5★ ÁGUA"` sobre cavalete na pista/passarela.
   * Cada soco (até 3) solta uma gota de hidratação (`createDrop`), toca splash e alterna para o frame 1 (tampa aberta/vazio) após a 3ª gota.
2. **`createUberGoal(centerX, footY)` (marcador `A`, sprite `uber_goal [32, 40, 2]`)**:
   * Ponto de Desembarque VIP 5 Estrelas em frente ao portão da Transportadora de São Paulo (placa luminosa `"UBER 5★"` + totem com a água gelada de cortesia da corrida).
   * Tocar o objetivo aciona `world.win()`, toca `'horn'` + `'deliver'`, e o Pardo bebe a água de cortesia (`'mineral'`) comemorando a chegada 5 estrelas!
