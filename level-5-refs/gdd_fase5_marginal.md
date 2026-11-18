# Game Design Document (GDD): *Fase 5 — Marginal de São Paulo (De Uber até o Galpão)*

> **Documento Oficial de Design — Fase 5 (Autoscroller no Carro Preto da Uber)**  
> Referência de lore, mecânica de autoscroller em alta velocidade sobre o teto do carro preto da Uber, física no referencial do veículo, bestiário de 1 golpe, estrutura em 4 atos, arte, parallax e trilha sonora estilo *Mega Man*.  
> Execução multiagente: [`../PLAN-FASE5.md`](../PLAN-FASE5.md) e [`gdd_bestiario_fase5.md`](gdd_bestiario_fase5.md).

---

## 1. Premissa, Lore & Reordenação das Fases

Após matar a sede com a água mineral do faxineiro **Amaro** no pátio do Tribunal do Rio de Janeiro (**Fase 4 — "Favela do Rio"**), o Pardo precisa chegar a São Paulo antes do amanhecer para o turno da manhã na transportadora. Desembarcando na entrada da capital paulista em plena madrugada chuvosa/neon, ele chama uma corrida pelo aplicativo: um **carro sedã preto com o letreiro "UBER" estampado na porta e o motorista visível ao volante**.

O trânsito da **Marginal Tietê, Minhocão e Viadutos de São Paulo**, porém, está completamente insano: bloqueios de obra da CET, viadutos em manutenção com vãos abertos sobre o Rio Tietê, ônibus engarrafados, motoboys do grau, drones de delivery rasantes, Faria Limers de patinete elétrico e pichadores nos pórticos. Sem tempo a perder, **Pardo sobe no teto do carro preto da Uber** e vai surfando em alta velocidade pela metrópole, desviando, pulando de viaduto em viaduto e socando tudo no caminho até o desembarque VIP 5 estrelas na portaria da **Transportadora de São Paulo**!

### Ordem Oficial da Campanha (6 Fases + 1 Fase Bônus)
1. **Fase 1 (`levelIndex = 0`)**: *"Trilha dos Monólitos"* (`theme: 'sertao'`)
2. **Fase 2 (`levelIndex = 1`)**: *"Coração da Amazônia"* (`theme: 'amazonia'`)
3. **Fase 3 (`levelIndex = 2`)**: *"Bahia World"* (`theme: 'bahia'`, subaquática) → *Fase Bônus: "Tubo do Bonfim"* (com `3/3` fitinhas)
4. **Fase 4 (`levelIndex = 3`)**: *"Favela do Rio"* (`theme: 'rio'`)
5. **Fase 5 (`levelIndex = 4`) — NOVA**: *"Marginal de São Paulo"* (`theme: 'uber'`, autoscroller em cima do carro preto da Uber, subtítulo `"DE UBER ATÉ O GALPÃO"`)
6. **Fase 6 (`levelIndex = 5`) — MOVIDA**: *"Transportadora de São Paulo"* (`theme: 'sampa'`, subtítulo `"HORA DO CAFÉ"`, objetivo Renan Maia)

---

## 2. Mecânica Core: Autoscroller em Cima do Carro Preto da Uber

### 2.1. Inspirações Diretas
* **Mega Man X4 — *Jet Stingray Stage***: corrida contínua em alta velocidade cortando viadutos urbanos sobre a água, com partículas/faíscas sob o veículo, inimigos motorizados e drones que entram pela tela e **morrem com 1 único golpe**, além de barreiras que podem ser destruídas no reflexo sem perder o embalo.
* **Donkey Kong Country — *Mine Cart Carnage***: leitura rápida de vãos nos viadutos, saltos cronometrados a partir de um veículo em movimento constante, trilhos/passarelas elevadas opcionais ou obrigatórias, e obstáculos baixos/pórticos que exigem pular e aterrissar de volta no veículo.

### 2.2. Física no Referencial do Autoscroll (`level.autoscroll === true`)
* **Velocidade do Autoscroll (`UBER_SPEED = 80 px/s`)**:
  * Enquanto `camera.x < level.widthPx - VIEW_W - 1`, a câmera avança continuamente para a direita a `UBER_SPEED` (`80 px/s`, equivalentes a `5 tiles/s`).
  * Quando a câmera atinge o Ato 4 (`camera.x >= level.widthPx - VIEW_W - 1`, zona pacífica de desembarque na portaria da Transportadora), o carro da Uber estaciona suavemente e `baseVx` passa a ser `0`.
* **Movimento do Pardo (`src/game/player.ts`)**:
  * O Pardo move-se sob velocidade de referência `baseVx = scrolling ? UBER_SPEED : 0`:
    * Sem apertar `←` ou `→` (`dirIn === 0`), `player.vx` converge para `baseVx` (`80 px/s`). Ou seja, o Pardo permanece **estacionário em relação à câmera e firme sobre o teto do carro da Uber**!
    * Apertando `→` (`dirIn = +1`), o Pardo acelera até `baseVx + PHYS.runMax` (`80 + 110 = 190 px/s`), avançando para a frente do carro e da tela.
    * Apertando `←` (`dirIn = -1`), o Pardo reduz para `baseVx - PHYS.runMax` (`80 - 110 = -30 px/s`), recuando para a traseira do carro e para a esquerda da tela.
    * **Momento preservado no pulo**: ao pular (`↑` / `W`), o Pardo conserva `baseVx` no ar! Se pular sem tocar nas setas, ele sobe e pousa **exatamente no mesmo ponto do teto do Uber**. Se pular segurando `→` ou `←`, salta para frente ou para trás em relação ao carro/tela.
    * **Olhar e Soco (`facing`)**: quando o jogador solta o direcional (`dirIn === 0`) durante o autoscroll no chão, `facing` volta automaticamente para `+1` (olhando para a frente da corrida), permitindo socar inimigos que vêm pela frente com 1 toque. Segurar `←` permite olhar e socar para trás.
* **O Carro Preto da Uber (`uber_car`, `64×24 px`, `platform: true`)**:
  * O asfalto da pista principal da Marginal fica na **linha 11** (`y = 176..192`).
  * Nas colunas onde há asfalto (`=` na linha 11), o carro da Uber roda na **linha 10**, com o **teto pisável exatamente em `y = 160` (`10 * TILE`)** e as rodas apoiadas no asfalto da linha 11 (`y = 184`).
  * Horizontalmente, o carro acompanha suavemente a posição X do Pardo dentro da janela da câmera (`[camera.x + 8, camera.x + VIEW_W - 72]`), com um leve lag visual (`±12 px`) para que os pés do Pardo caminhem do porta-malas até o capô quando o jogador se move para trás ou para frente, mas mantendo a plataforma de `64 px` do teto sempre sob o Pardo enquanto houver asfalto na linha 11!
  * **Comportamento nos Vãos do Viaduto (Buracos na linha 11)**:
    * Quando a coluna sob o Pardo não tem asfalto na linha 11 (vão aberto entre viadutos sobre o Rio Tietê `~` ou fosso `.`), o carro da Uber mergulha pelo desvio/rampa inferior (`y` desce suavemente para `184 px` e `platform` desativa naquela coluna).
    * Isso obriga o Pardo a **pular do teto do Uber** antes do vão (ou subir pelas passarelas `-` / tetos de ônibus `R`) e **pousar de volta no teto do Uber** quando o asfalto `=` reaparece do outro lado!
  * **Comportamento sob Pórticos, Caixas e Ônibus**:
    * Como o carro da Uber ocupa `y = 160..184` (linha 10), ele passa livremente por baixo de estruturas que ocupam as linhas `0..9` (`y <= 160`).
    * Já o **Pardo em pé no teto do Uber** ocupa `y = 140..160` (linhas 8 e 9)! Assim:
      * Caixas quebráveis (`B`, `?`, `W`) ou inimigos na **linha 9** batem de frente com o Pardo no teto do Uber — o Pardo deve **socá-los** ou **pular por cima**!
      * Pórticos/ônibus (`R`) nas **linhas 8–9** exigem que o Pardo **pule do teto do Uber para cima do ônibus/passarela** (linha 7 ou 6), corra por cima e desça de volta para o teto do Uber adiante!
* **Proteção e Esmagamento nas Bordas da Câmera**:
  * **Borda direita**: o Pardo não ultrapassa `camera.x + VIEW_W - 8`.
  * **Borda esquerda**: se o Pardo recuar até `camera.x + 6` com caminho livre à frente, a traseira do carro o mantém em `camera.x + 6` sem dano. Caso o Pardo fique preso atrás de uma parede sólida (`R` ou `B`) e seja espremido pela borda esquerda (`player.x < camera.x - 2`), ele sofre `1` de dano (`player.hurt`) e é impulsionado para cima/frente (`x = camera.x + 12`, `vy = -180`) para escapar do bloqueio.

---

## 3. Legenda do Mapa ASCII (`src/game/level5.ts`, `240×14`)

* **Dimensões**: `240 colunas × 14 linhas` (`TILE = 16`, `3840 × 224 px`).
* **Tiles**:
  * `.` : vazio
  * `=` : asfalto da Marginal com faixa reflexiva (`Tile.GroundTop`) — na linha 11 sustenta a rodagem do Uber (teto do Uber em `y = 160`, linha 10)
  * `#` : concreto estrutural do viaduto (`Tile.Ground`)
  * `R` : carroceria de ônibus/furgão ou pilar de viaduto indestrutível (`Tile.Rock`, 3 cores por sequência contígua: vermelho-SPTrans, azul-metrô e prata)
  * `^` : barreira eletrificada / ferro retorcido de obra (`Tile.Spike`, letal)
  * `~` : água poluída do Rio Tietê sob os vãos do viaduto (`Tile.Water`, letal com splash)
  * `B` : barreira laranja da CET / caixote de obra (`Tile.Block`, quebrável com 1 soco)
  * `?` : caixa de suprimento com moeda (`Tile.BlockItem`)
  * `W` : caixa de suprimento com gota d'água (`Tile.BlockItem` em `dropBlockChars`)
  * `-` : passarela metálica / viga suspensa de pórtico (`Tile.OneWay`)
* **Marcadores de Entidades**:
  * `P` : spawn inicial do Pardo (no teto do Uber, linha 9) + instancia o `uber_car`
  * `K` : checkpoint (placa luminosa da Marginal; ao morrer e renascer num checkpoint, a câmera e o Uber reposicionam-se junto ao checkpoint!)
  * `c` : moeda
  * `m` / `M` : drone-plataforma móvel horizontal / vertical (`LEVEL5_MOVERS`)
  * `d` : viga enferrujada bamba (`platform_beam`, cede após pisar)
  * `V` : cooler térmico 5 estrelas (`cooler_uber`, solta até 3 gotas ao ser socado)
  * `y` : **Motoboy do Grau** (`motoboy`, 1 soco, 300 pts)
  * `u` : **Drone de Delivery** (`drone`, aéreo, 1 soco, 250 pts)
  * `p` : **Faria Limer de Patinete** (`patinete`, salta ao aproximar, 1 soco, 200 pts)
  * `z` : **Pichador do Viaduto** (`pichador`, no alto, arremessa `lata` socável; 1 soco, 350 pts)
  * `A` : **Desembarque VIP 5 Estrelas** na entrada da Transportadora (`uber_goal`, objetivo da Fase 5)
* **Decoração**:
  * `b` : frente de ônibus/furgão (`bus_front [40, 48, 1]`, na linha 10 à direita de um bloco `R` nas linhas 7..9)
  * `w` : rodas de ônibus/furgão (`bus_wheels [48, 16, 1]`, na linha 10 sob o bloco `R`)
  * `s` : placa verde da Marginal (`marginal_sign [24, 24, 1]`)
  * `r` : radar de velocidade `"60 KM/H"` (`speed_radar [16, 32, 1]`)
  * `l` : poste curvo de luz da Marginal (`street_light [16, 48, 1]`)
  * `n` : cone de trânsito da CET (`traffic_cone [8, 12, 1]`, centralizado)

---

## 4. Estrutura em 4 Atos (`240 colunas`)

1. **Ato 1 — Entrada da Marginal Tietê (colunas `0–59`)**:
   * Pista contínua para o jogador sentir o controle em cima do carro preto da Uber (mover para frente/trás, pular e socar mantendo a velocidade).
   * Primeiras barreiras da CET (`B?B`) na linha 9 para quebrar no soco, 1º Faria Limer de patinete (`p`), 1º Drone de delivery (`u`), primeiro ônibus engarrafado (`R` com `w` e `b`) para pular do teto do Uber para o teto do ônibus, cooler térmico `V1` e checkpoint `K1`.
2. **Ato 2 — Viadutos do Tietê & Obras da CET (colunas `60–124`)**:
   * Primeiros **vãos abertos no viaduto** (2–3 tiles com água do Rio Tietê `~` nas linhas 12–13), exigindo saltar do teto do Uber por cima da água e pousar de volta no Uber do outro lado.
   * Estreia do **Motoboy do Grau** (`y`) dando corte de giro e do **Pichador do Viaduto** (`z`) no alto das passarelas/ônibus atirando latas de spray.
   * Rota alta por passarelas metálicas (`-`) e vigas bambas (`d`) com segredos `?W`, checkpoints `K2` e `K3`, e cooler `V2`.
3. **Ato 3 — Minhocão & Hora do Rush (colunas `125–207`)**:
   * Sequência intensa inspirada em *Jet Stingray* + *Mine Cart Carnage*: ônibus duplos, vãos cruzados por drones-plataforma (`m`/`M`), formação de drones (`u`) + motoboys (`y`) + patinetes (`p`) — todos caindo com 1 golpe certeiro!
   * Paredes de barreiras `B` que o Pardo estoura no soco em alta velocidade, checkpoints `K4` e `K5`, e cooler `V3`.
4. **Ato 4 — Desembarque na Transportadora (colunas `208–239`, 100% pacífico)**:
   * O autoscroll desacelera e estaciona na rampa iluminada de entrada da Transportadora de São Paulo.
   * Cooler `V4`, placas e cones da portaria, e o totem/recepção **`A` (Desembarque Uber 5 Estrelas)** onde o Pardo recebe a água de cortesia 5 estrelas antes de entrar na Transportadora (Fase 6)!
