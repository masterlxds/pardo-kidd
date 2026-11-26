# Bestiário, Planetas, Obstáculos e Objetos — *Fase 7: Espaço Sideral (Órbita de Quixadá)*

> **Versão 1.0 (19/11/2026).** Referência completa de entidades para `src/game/enemies7.ts`, `src/game/objects7.ts`, `src/game/spaceRules.ts`, `src/gfx/art/space.ts` e `src/gfx/art/enemies7.ts`.
> **Regra de leitura:** **roxo/magenta/âmbar com anéis concêntricos** = gravidade letal (instakill) · **cinza metálico / zebrado / feixe vermelho-branco** = indestrutível (desvie) · **contorno claro com verde-alien, laranja-brasa ou ciano-gelo** = destrutível no soco.
> Mecânica geral e estrutura de atos em [`gdd_fase7_espaco.md`](gdd_fase7_espaco.md).

Coordenadas de referência: tela lógica `320 × 180 px` (`RENDER_SCALE = 2×`); área jogável do Pardo `x ∈ [20, 288]`, `y ∈ [18, 162]`; rolagem constante da câmera a `96 px/s` (6 colunas/s).

---

## 1. Protagonista: Pardo Astronauta (`pardo_space`)

| Sprite | Dimensão lógica | Quadros | Uso |
|---|---|---|---|
| `pardo_space_idle` | `24 × 24` | 2 | Flutuação neutra em gravidade zero (chama mínima do jetpack) |
| `pardo_space_thrust` | `24 × 24` | 2 | Empuxo ativo no direcional (chama longa laranja/amarela no jetpack) |
| `pardo_space_boost` | `24 × 24` | 2 | Impulso de Escape (botão Pulo): jato azul-ciano intenso + corpo inclinado |
| `pardo_space_punch` | `28 × 24` | 2 | Soco Espacial (punho estendido 18 px à frente + onda de choque branca) |
| `pardo_space_hurt` | `24 × 24` | 1 | Dano comum (−1 gota): recuo + brilho piscando |
| `pardo_space_drink` | `24 × 24` | 2 | Cutscene final: visor levantado, máscara abaixada bebendo o sachê d'água |

- **Direção de arte obrigatória:** o **capacete de astronauta é 100% transparente** (cúpula circular de vidro com reflexo branco-azulado no canto superior esquerdo e aro metálico no pescoço), garantindo leitura clara do **cabelo cacheado, óculos de armação preta e máscara preta**.
- **Jetpack:** mochila prateada nas costas com dois bicos propulsores voltados para trás/baixo; a chama varia de tamanho conforme o vetor de aceleração.
- **Hitbox:** `10 × 18 px` centralizada no torso (ignora a borda externa do capacete e do jetpack para desvios precisos).

---

## 2. Mecânica Principal: Planeta Yuri & Planeta Yumi (Perigo Gravitacional Letal)

| Kind | Marcador | Nome | Sprite | Raio Visual | `R_kill` (Morte) | `R_grav` (Puxão) | Velocidade em tela | Pontos |
|---|---|---|---|---|---|---|---|---|
| `planet_yuri` | `Y` | **Planeta Yuri** | `planet_yuri [48,48,2]` | 24 px | **21 px** | **92 px** | −72 px/s | — (indestrutível) |
| `planet_yumi` | `U` | **Planeta Yumi** | `planet_yumi [48,48,2]` | 24 px | **21 px** | **92 px** | −72 px/s | — (indestrutível) |

### 2.1. Regras compartilhadas (idênticas para Yuri e Yumi)
1. **Passagem periódica:** entram pela borda direita da tela (altura `y ∈ [38, 142]`, definida pela linha do marcador no mapa), atravessam horizontalmente em velocidade constante (`72 px/s` em relação à tela) e saem pela esquerda.
2. **Telegraph obrigatório:** **1,2 s** antes de surgir na tela, um indicador `⚠ YURI` ou `⚠ YUMI` pisca na borda direita exatamente na altura `y` do planeta, tocando `grav_warn`.
3. **Campo gravitacional contínuo:** enquanto o Pardo estiver dentro de `d < 92 px` do centro do planeta, sofre aceleração centrípeta contínua em direção ao centro:
   - `u = 1 − (d − 21) / (92 − 21)`
   - `a_grav = 340 × u^1.5` px/s² (máximo `340 px/s²` na borda letal, sempre inferior ao empuxo do jetpack de `420 px/s²`).
   - Feedback visual: anéis gravitacionais tracejados que encolhem em direção ao planeta + linhas de tração ligando o planeta ao Pardo quando `d < 92 px` + vibração leve do capacete quando `d < 44 px` + som `grav_hum`.
4. **Colisão = Morte automática (Instakill):** se `d ≤ 21 px`, o Pardo é imediatamente puxado para o núcleo e **morre na hora**, perdendo **1 vida** independentemente de quantas gotas tenha ou de estar invulnerável.
5. **Imunidade total:** o Soco Espacial não afeta Yuri nem Yumi.
6. **Variações de trajetória nos Atos 3 e 4:** além da passagem reta horizontal, marcadores com sufixo de onda podem fazer uma leve oscilação vertical (`±16 px`, período 4 s), sempre mantendo corredor seguro ≥ 64 px no lado oposto.

### 2.2. Identidade visual distinta
- **Planeta Yuri (`planet_yuri`):** astro rochoso-quente em tons de **terracota, laranja-âmbar e crateras vinho**, com um pequeno anel oblíquo dourado e brilho atmosférico quente. Anéis gravitacionais em **âmbar/dourado pulsante**.
- **Planeta Yumi (`planet_yumi`):** astro cósmico-nebuloso em tons de **magenta, violeta profundo e nuvens ciano**, com halo brilhante de estrelas minúsculas ao redor. Anéis gravitacionais em **magenta/ciano pulsante**.
- *Regra de acessibilidade:* ambos exibem o mesmo padrão geométrico de anéis concêntricos contraindo para o centro + alerta `⚠` na borda, para que o jogador reconheça instantaneamente o mesmo efeito mortal.

---

## 3. Inimigos (Destrutíveis no Soco Espacial)

| Kind | Marcador | Nome | Sprite | Hitbox | HP (Socos) | Velocidade | Dano | Pontos |
|---|---|---|---|---|---|---|---|---|
| `meteor` | `m` | Meteoro Comum | `meteor [16,16,2]` | 12×12 | **1** | −35 px/s | 1 gota | 150 |
| `meteor_fire` | `M` | Meteoro Flamejante | `meteor_fire [20,16,2]` | 14×12 | **1** | −95 px/s | 1 gota | 250 |
| `comet_ice` | `g` | Cometa de Gelo | `comet_ice [20,16,2]` | 14×12 | **1** | −110 px/s (diagonal) | 1 gota | 300 |
| `ufo` | `u` | OVNI Patrulheiro | `ufo [24,16,2]` | 18×12 | **1** | −40 px/s (senoide) | 1 gota | 300 |
| `alien_jet` | `a` | Alien de Jetpack | `alien_jet [20,24,2]` | 14×18 | **1** | −55 px/s (persegue Y) | 1 gota | 350 |
| `space_mine` | `b` | Mina Orbital Magnética | `space_mine [16,16,2]` | 12×12 | **1*** (só desarmada) | 0 (presa ao mundo) | 1 gota | 250 |

### 3.1. Meteoro Comum (`m`)
- **Visual:** rocha espacial marrom-cinza irregular com contorno claro e rachaduras laranja-brasa, girando lentamente em 2 quadros.
- **Comportamento:** deriva em linha reta para a esquerda em velocidade constante. Aparece isolado no Embarque e em pequenas constelações espaçadas nos Atos 1–4.
- **Regra / Resposta:** **1 Soco** estilhaça em pedacinhos (`meteor_break`, `fx('debris')`, +150 pts) ou desvio simples pelo plano 2D.
- **Papel:** inimigo-base da fase; ensina o alcance do Soco Espacial em gravidade zero.

### 3.2. Meteoro Flamejante (`M`)
- **Visual:** meteoro maior com núcleo incandescente amarelo/laranja e cauda de fogo crepitando atrás.
- **Comportamento:** entra rápido pela direita após breve brilho na borda (0,5 s de aviso). Segue trajetória reta horizontal (ou leve inclinação de 10°).
- **Regra / Resposta:** exige desvio vertical rápido **ou** um **Soco Espacial** bem cronometrado (janela ≥ 0,18 s) que o estilhaça em faíscas sem risco.
- **Papel:** teste de reflexo e leitura rápida de corredor.

### 3.3. Cometa de Gelo (`g`)
- **Visual:** pedra azul-cristal brilhante com cauda longa ciano e flocos cintilantes.
- **Comportamento:** cruza a tela em **diagonal** (de cima-direita para baixo-esquerda, ou o inverso). Antes de cruzar, projeta uma **linha tracejada azul-claro de aviso** por 0,7 s mostrando sua trajetória exata.
- **Regra / Resposta:** desviar saindo da linha tracejada, ou interceptar com **1 Soco** para estilhaçar e ganhar **+300 pts + 1 moeda bônus**.
- **Papel:** quebra a horizontalidade pura da tela e recompensa jogadas agressivas.

### 3.4. OVNI Patrulheiro (`u`)
- **Visual:** disco voador metálico prateado com cúpula verde-neon revelando um pequeno alien verde piscando os olhos, luzes amarelas girando na borda.
- **Comportamento:** entra pela direita voando em **onda senoidal vertical** (`amplitude ±28 px`, período 2,4 s). Quando está a 120–160 px do Pardo, a cúpula pisca em branco por **0,55 s** (aviso) e dispara **1 projétil de plasma** (`plasma_orb`, 8×8, velocidade 130 px/s) em linha reta horizontal.
- **Regra / Resposta:** **1 Soco** arremessa o OVNI girando para fora da tela (+300 pts). O projétil de plasma causa 1 gota de dano e **pode ser rebatido/destruído com o Soco Espacial** (+50 pts).
- **Papel:** primeiro inimigo ativo de tiro; testa posicionamento vertical e tempo de reação.

### 3.5. Alien de Jetpack (`a`)
- **Visual:** primo espacial do alien verde da Fase 2 — pele verde-limão, olhos grandes pretos, camiseta roxa espacial e um mini-jetpack cuspindo faíscas roxas.
- **Comportamento:** entra na metade direita da tela e **ajusta suavemente sua altura (`y`)** para se alinhar ao Pardo (`vy_max = 48 px/s`) enquanto avança devagar. A 90 px de distância, trava a altura por **0,45 s** (pisca e agacha no ar) e dá um **avanço rápido em linha reta** (`140 px/s`).
- **Regra / Resposta:** mudar de altura após ele travar o alvo (deixando-o passar direto) **ou** acertar **1 Soco Espacial** de frente antes/durante o avanço (+350 pts).
- **Papel:** inimigo caçador que obriga o jogador a se mexer no eixo Y.

### 3.6. Mina Orbital Magnética (`b`)
- **Visual:** esfera metálica escura com pinos pontiagudos e um LED central. Verde/apagado quando inativa; vermelho pulsante + anel de aviso quando armada.
- **Comportamento:** flutua parada em relação ao mundo (acompanha apenas a rolagem da câmera). Quando o Pardo chega a menos de **56 px**, o LED começa a piscar rápido por **0,5 s** (armando); depois fica **armada** com aura elétrica vermelha.
- **Regra / Resposta:**
  - **Desarmada:** **1 Soco** a arremessa para longe, explodindo sem ferir (+250 pts).
  - **Armada:** **imune a soco** (o soco rebate e aciona a explosão de curto raio, causando −1 gota). Deve ser contornada com folga.
- **Papel:** controle de espaço no Ato 3, especialmente em corredores próximos às rotas de Yuri e Yumi.

---

## 4. Obstáculos (Indestrutíveis — Não Morrem no Soco)

| Kind | Marcador | Nome | Sprite | Hitbox / Zona | Comportamento | Resposta |
|---|---|---|---|---|---|---|
| `satellite` | `s` | Satélite em Órbita | `satellite [32,20,2]` | 28×14 | Flutua devagar com painéis solares abertos | **CONTORNE** |
| `satellite_beam` | `S` | Satélite de Varredura | `satellite_beam [24,20,2]` | Corpo 20×14 + Feixe 10×140 | Carrega 0,8 s e dispara feixe laser telegrafado | **DESVIE DO FEIXE** |
| `space_debris` | `d` | Lixo Espacial | `space_debris [24,24,2]` | 18×18 | Resto de foguete/painel girando | **CONTORNE** |
| `solar_wind` | `v` | Rajada de Vento Solar | `solar_wind [320,24,2]` | Faixa horizontal 22 px alt. | Telegrafa 1,0 s na borda e varre uma faixa horizontal por 1,4 s | **REPOSICIONE EM Y** |

### 4.1. Satélite em Órbita (`s`)
- **Visual:** corpo cilíndrico dourado/prateado com antena parabólica e dois grandes painéis solares azul-escuro com grade ciano.
- **Comportamento:** acompanha a rolagem da fase (ou deriva muito devagar a −15 px/s), ocupando uma faixa horizontal larga.
- **Regra:** **indestrutível**. Tocar causa −1 gota; socar produz som metálico de ricochete (`clang`) sem destruir. Exige contornar por cima ou por baixo.

### 4.2. Satélite de Varredura (`S`)
- **Visual:** satélite compacto cinza-escuro com lente frontal vermelha brilhante.
- **Comportamento:** posiciona-se no topo (`y = 22`) ou na base (`y = 158`) da tela. Ao entrar no campo de visão, projeta uma **linha fina tracejada vermelha** (telegraph de **0,8 s** + SFX `laser_charge`) e dispara um **feixe laser espesso** (10 px de largura, branco no centro e vermelho nas bordas) por **0,7 s** (`laser_fire`), depois desliga por **1,2 s**.
- **Regra:** passar enquanto o feixe está desligado ou contornar antes da linha de tiro. Nunca aparece bloqueando o corredor seguro durante a passagem de Planeta Yuri ou Planeta Yumi.

### 4.3. Lixo Espacial (`d`)
- **Visual:** sucata espacial reconhecível (pedaço de foguete com listras zebradas amarelo/preto ou painel solar torto), girando devagar em 2 quadros.
- **Comportamento:** obstáculo rígido flutuando em velocidade fixa.
- **Regra:** **indestrutível**; tocar causa −1 gota. Serve para desenhar "chicanes" e corredores espaciais legíveis.

### 4.4. Rajada de Vento Solar (`v`)
- **Visual:** faixa translúcida dourado-alaranjada com partículas de plasma riscando rapidamente da direita para a esquerda.
- **Comportamento:** antes de ativar, exibe um alerta lateral `⚠ VENTO SOLAR` com faixa tracejada amarela por **1,0 s** numa altura `y` fixa (faixa de 22 px de altura). Ao ativar, varre a faixa por **1,4 s**: empurra o Pardo para trás e causa −1 gota se ele permanecer dentro.
- **Regra:** sair da faixa marcada durante o aviso de 1,0 s. Nunca coincide com a única rota de escape de um planeta.

---

## 5. Clímax do Ato 4: Nave-Mãe Alienígena (`N`)

- **Sprite:** `mothership [64,56,2]` (grande disco/cruzador alienígena metálico com luzes verde-neon, escotilha central que abre para liberar OVNIs e propulsores traseiros).
- **Papel (mesmo padrão do Caminhão-Baú da Fase 5):** não tem barra de vida nem combate de chefe tradicional. Entra pela direita no compasso 50 com som grave (`horn`/`ufo_boss`), trava em `x de tela = 264` e escolta o Pardo pelos 12 compassos do Ato 4, liberando **ondas ritmadas** de OVNIs Patrulheiros (`u`), Meteoros Flamejantes (`M`) e disparos telegrafados de plasma enquanto **Planeta Yuri** e **Planeta Yumi** fazem sua passagem final.
- **Desfecho:** ao atingir o compasso 62 (perto da Estação Espacial de Quixadá), a Nave-Mãe solta faíscas, recua para fora da tela e libera a passagem para a cutscene de acoplagem.

---

## 6. Objetos, Coletáveis e Objetivo Final

| Marcador | Objeto | Sprite | Comportamento |
|---|---|---|---|
| `W` | **Cápsula de Água Espacial** | `water_capsule [16,16,2]` | Cilindro/sachê prateado com gota azul brilhante girando devagar. **Não fere.** Tocar ou socar concede **+1 gota** de hidratação (`water`, `fx('splash')`). |
| `c` | **Moeda Estelar** | `coin` (existente) | Disposta em linhas e **arcos de "estilingue gravitacional"** ao redor de Yuri e Yumi para ensinar a rota segura. |
| `K` | **Boia de Checkpoint Orbital** | `space_beacon [16,24,2]` | Antena espacial que acende verde ao cruzar a coluna (ativação automática por passagem). Garante 1,8 s sem ameaças após renascer. |
| `A` | **Estação Espacial de Quixadá (EEIQ)** | `eeiq_station [80,64,2]` + `water_pouch [12,16,1]` | Destino da cutscene final: módulo orbital branco com painéis dourados, bandeira do Ceará e letreiro `EEIQ`. Acoplar dispara `win` e a animação do Pardo bebendo o Sachê de Água Espacial. |
| `t` | **Holograma de Tutorial** | `holo_sign [24,24,3]` | Pictogramas holográficos `MOVA 2D`, `IMPULSO (PULO)` e `GRAVIDADE LETAL` no Embarque e antes do 1º Planeta Yuri. Decoração sem colisão. |

---

## 7. Resumo de contrato para `SPRITE_SPEC` (`src/gfx/spec.ts`)

| Nome do sprite | Dimensão lógica `[w, h, frames]` | Arquivo de arte | Categoria |
|---|---|---|---|
| `pardo_space_idle` | `[24, 24, 2]` | `src/gfx/art/space.ts` | Protagonista |
| `pardo_space_thrust` | `[24, 24, 2]` | `src/gfx/art/space.ts` | Protagonista |
| `pardo_space_boost` | `[24, 24, 2]` | `src/gfx/art/space.ts` | Protagonista |
| `pardo_space_punch` | `[28, 24, 2]` | `src/gfx/art/space.ts` | Protagonista |
| `pardo_space_hurt` | `[24, 24, 1]` | `src/gfx/art/space.ts` | Protagonista |
| `pardo_space_drink` | `[24, 24, 2]` | `src/gfx/art/space.ts` | Protagonista |
| `planet_yuri` | `[48, 48, 2]` | `src/gfx/art/space.ts` | Planeta Gravitacional |
| `planet_yumi` | `[48, 48, 2]` | `src/gfx/art/space.ts` | Planeta Gravitacional |
| `water_capsule` | `[16, 16, 2]` | `src/gfx/art/space.ts` | Objeto / Cura |
| `space_beacon` | `[16, 24, 2]` | `src/gfx/art/space.ts` | Checkpoint |
| `eeiq_station` | `[80, 64, 2]` | `src/gfx/art/space.ts` | Objetivo Final |
| `water_pouch` | `[12, 16, 1]` | `src/gfx/art/space.ts` | Item Final |
| `holo_sign` | `[24, 24, 3]` | `src/gfx/art/space.ts` | Decoração / Tutorial |
| `meteor` | `[16, 16, 2]` | `src/gfx/art/enemies7.ts` | Inimigo (1 soco) |
| `meteor_fire` | `[20, 16, 2]` | `src/gfx/art/enemies7.ts` | Inimigo (1 soco) |
| `comet_ice` | `[20, 16, 2]` | `src/gfx/art/enemies7.ts` | Inimigo (1 soco) |
| `ufo` | `[24, 16, 2]` | `src/gfx/art/enemies7.ts` | Inimigo (1 soco) |
| `plasma_orb` | `[8, 8, 2]` | `src/gfx/art/enemies7.ts` | Projétil (socável) |
| `alien_jet` | `[20, 24, 2]` | `src/gfx/art/enemies7.ts` | Inimigo (1 soco) |
| `space_mine` | `[16, 16, 2]` | `src/gfx/art/enemies7.ts` | Inimigo / Perigo |
| `satellite` | `[32, 20, 2]` | `src/gfx/art/enemies7.ts` | Obstáculo rígido |
| `satellite_beam` | `[24, 20, 2]` | `src/gfx/art/enemies7.ts` | Obstáculo / Laser |
| `space_debris` | `[24, 24, 2]` | `src/gfx/art/enemies7.ts` | Obstáculo rígido |
| `mothership` | `[64, 56, 2]` | `src/gfx/art/enemies7.ts` | Clímax (Ato 4) |

*(Todos os sprites serão autorados em `RENDER_SCALE = 2×` e validados com `npm run check:art`.)*
