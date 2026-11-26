# Game Design Document (GDD): *Fase 7 — Espaço Sideral (Órbita de Quixadá)*

> **Documento oficial de design — Fase 7, versão 1.0 (19/11/2026).**
> Padrão de referência do projeto *Pardo Kidd in Quixadá World* (Pardo Studios).
> Documento irmão: [`gdd_bestiario_fase7.md`](gdd_bestiario_fase7.md) (Pardo Astronauta, Planeta Yuri, Planeta Yumi, inimigos, obstáculos, objetos e especificações de sprite).
> Versão formatada para revisão de equipe: [`GDD_Fase7_Espaco_Pardo_Kidd.pdf`](GDD_Fase7_Espaco_Pardo_Kidd.pdf).

---

## 1. Premissa e lore

Depois de tomar o café extraforte do **Renan Maia** na Transportadora de São Paulo (Fase 6), a cafeína bate forte demais no **Pardo Kidd**. Sem conseguir dormir e com energia sobrando pelos ouvidos, ele encontra um **jetpack improvisado** e um **capacete de astronauta de visor transparente** (mantendo o rosto, os óculos e a máscara preta perfeitamente visíveis) nos fundos do galpão, dispara pelos céus e rompe a atmosfera.

Agora em **gravidade zero**, Pardo cruza a órbita terrestre desviando de meteoros, satélites, lixo espacial e da frota de **aliens** (primos distantes do alien da Amazônia, só que bem menos amigáveis). O maior perigo do espaço, porém, não atira nem persegue: de tempos em tempos, os colossais **Planeta Yuri** e **Planeta Yumi** cruzam o setor espacial gerando **campos gravitacionais intensos** que puxam o Pardo para o seu núcleo — e qualquer colisão com um dos dois significa **morte instantânea**. O objetivo é sobreviver à travessia orbital até acoplar na **Estação Espacial de Quixadá (EEIQ)** e garantir o lendário **Sachê de Água Espacial Gelada**.

- Cartão de intro: `FASE 7` · `ESPAÇO SIDERAL` · subtítulo `ÓRBITA DE QUIXADÁ`.
- `theme: 'space'`, `autoscroll: true`, `zeroGravity: true`, `levelIndex = 6`. Atalho de teste: `?fase=7`.

---

## 2. Pilares de design

1. **Liberdade total em 2D sob pressão constante.** Diferente da Fase 5 (onde o carro ficava preso ao asfalto), aqui o Pardo se move livremente nos eixos X e Y dentro da tela em **gravidade zero**, enquanto a câmera rola continuamente para a direita.
2. **Gravidade como protagonista (Planeta Yuri & Planeta Yumi).** A fase inteira orbita em torno da leitura espacial dos campos gravitacionais. Quando Yuri ou Yumi entram em cena, o jogador sente o puxão no controle e precisa usar contra-empuxo, rota de contorno ou o Impulso do Jetpack para não ser engolido.
3. **Soco curto + Mobilidade aérea.** O Pardo continua sendo o Pardo: nada de metralhadora automática. Seu ataque segue sendo o **Soco Espacial** (curto alcance, 18 px), recompensando posicionamento ousado para quebrar meteoros, derrotar aliens e estourar cápsulas d'água, enquanto ameaças rígidas exigem desvio limpo.
4. **Leitura imediata por silhueta e cor.** Três famílias visuais governam toda a tela: **roxo/magenta/âmbar pulsante** = campo gravitacional letal (Yuri e Yumi); **cinza metálico / amarelo zebrado / ciano elétrico** = obstáculo rígido ou perigo que não se soca (desvie); **contorno claro com verde-alien ou laranja-brasa** = alvo destrutível com soco.
5. **Escalada justa e memorizável.** Cada mecânica estreia isolada antes de ser combinada. A primeira passagem do Planeta Yuri acontece em corredor limpo para ensinar o puxão gravitacional sem ruído visual.

---

## 3. Referências e o que tiramos de cada uma

| Referência | O que entra | O que fica de fora |
|---|---|---|
| **Gradius / R-Type (Shmups 2D clássicos)** | Autoscroller horizontal com movimento livre no plano 2D, ondas de inimigos espaciais, leitura de padrão e ritmo crescente por atos | Tiro automático contínuo, power-ups de laser/escudo empilháveis e bullet hell denso |
| **Sonic 2 — Sky Chase Zone** | Sensação de aventura leve em plano aberto, inimigos vindo em formações legíveis, forte presença de parallax e transições climáticas de fundo | Ficar preso em cima de um veículo (aqui o Pardo voa solto com jetpack) |
| **Super Mario Galaxy / Gravidade Arcade** | Campos gravitacionais visíveis por anéis pulsantes, sensação tátil de ser puxado e usar a borda do campo para manobrar ao redor do astro | Rotação de câmera, física newtoniana complexa de 360° ou órbita presa ao planeta |
| **Alex Kidd (DNA da série)** | Soco de curto alcance como única arma ofensiva, silhueta carismática do protagonista e humor brasileiro absurdo | Controles deslizantes escorregadios demais (a inércia zero-G aqui tem amortecimento rápido) |

---

## 4. Mecânica central

### 4.1. Pardo Astronauta em gravidade zero

- **Visual:** Pardo mantém sua silhueta clássica (camiseta amarela, jeans azul, cabelo cacheado, óculos e **máscara preta**), agora usando um **capacete de astronauta transparente** (cúpula de vidro com brilho especular para o rosto e a máscara continuarem 100% legíveis) e um **jetpack metálico** nas costas com propulsor animado que reage à direção do empuxo.
- **Movimento 2D livre (8 direções):** o direcional (`←` `→` `↑` `↓` ou D-pad touch) aciona os propulsores do jetpack. Não há gravidade global puxando para baixo: soltar o direcional aplica um **amortecimento suave** (*zero-G damping*) que preserva a sensação de flutuar no espaço sem deixar o controle escorregadio.
- **Limites da tela:** o Pardo pode se mover livremente em `x ∈ [20, 288]` e `y ∈ [18, 162]` (em coordenadas de tela 320×180), mantendo sempre margem de segurança contra as bordas. Não existe esmagamento contra a borda esquerda porque não há tiles sólidos bloqueando o avanço — toda ameaça é entidade que fere ou mata.
- **Orientação:** `facing = +1` travado para a direita (frente da rolagem), garantindo que o Soco Espacial sempre acerte quem vem pela frente.

### 4.2. Parâmetros de controle e física (`SPACE` em `src/game/spaceRules.ts`)

| Parâmetro | Valor | Observação |
|---|---|---|
| Velocidade da rolagem (`SPACE.scrollSpeed`) | **96 px/s** = 6,0 colunas/s | Constante do início ao fim; 20% mais lenta que a Fase 5 para dar tempo de manobra 2D |
| Andamento da trilha | 120 BPM → 1 tempo = 0,5 s = **3 colunas** | 1 compasso (4 tempos) = 2,0 s = **12 colunas** |
| Aceleração do jetpack (`SPACE.thrust`) | **420 px/s²** | Resposta ágil em qualquer uma das 8 direções |
| Velocidade máx. em tela (`SPACE.maxSpeed`) | **125 px/s** | Permite atravessar a tela verticalmente em ~1,2 s |
| Amortecimento zero-G (`SPACE.damping`) | **4,2 s⁻¹** (decaimento exponencial) | Para suavemente em ~0,25 s ao soltar o direcional |
| Soco Espacial (`SPACE.punch`) | alcance **18 px**, ativo **0,12 s**, total **0,24 s** | Mesmo DNA das outras fases; gera pequena faísca/onda de choque no vácuo |
| Impulso de Escape / Boost (botão Pulo) | **+190 px/s** por **0,16 s**, cooldown **1,4 s** | Substitui o pulo em zero-G; dá um jato forte na direção atual do direcional (ou para frente se neutro), com rastro azul-ciano |
| Hitbox do Pardo (`SPACE.playerHitbox`) | **10 × 18 px** (centralizada no tronco) | Ligeiramente menor que o sprite 24×24 (capacete + jetpack), favorecendo o jogador em desvios rentes |

### 4.3. Mecânica principal: Planeta Yuri & Planeta Yumi

**Planeta Yuri** e **Planeta Yumi** são os astros errantes que definem a identidade da Fase 7. Eles entram periodicamente pela borda direita da tela, atravessam o campo de jogo em velocidade constante (própria ou acompanhando a rolagem) e saem pela esquerda. **Ambos têm exatamente o mesmo efeito mecânico**, alternando sua aparição ao longo dos atos e, no clímax, cruzando em sequência escalonada.

#### Aviso de entrada (Telegraph)
- **1,2 segundo antes** de o planeta surgir na borda direita, um **ícone de alerta orbital** (`⚠ YURI` ou `⚠ YUMI` com seta pulsante na altura `y` exata de entrada) pisca na margem direita da tela junto do SFX `grav_warn`. O jogador sempre tem tempo de se posicionar no corredor oposto antes de o campo gravitacional alcançá-lo.

#### Campo gravitacional (Fórmula de contrato)
Enquanto o planeta estiver ativo na tela, se a distância `d` entre o centro do Pardo e o centro do planeta for menor que `R_grav`:

```
se d <= R_kill:
    MORTE AUTOMÁTICA IMEDIATA (perde 1 vida na hora, ignora gotas e invulnerabilidade)

se R_kill < d < R_grav:
    u = 1 - (d - R_kill) / (R_grav - R_kill)       // 0 na borda externa → 1 na superfície
    a_grav = G_max * (u ^ 1.5)                     // aceleração centrípeta em direção ao planeta
    dir = normalize(planeta.pos - pardo.pos)
    pardo.vx += dir.x * a_grav * dt
    pardo.vy += dir.y * a_grav * dt
```

| Parâmetro gravitacional | Valor | Por que este número |
|---|---|---|
| Raio visual do planeta | **24 px** (sprite 48×48) | Grande e imponente na tela de 320×180 (ocupa ~27% da altura) |
| Raio letal (`R_kill`) | **21 px** | 3 px menor que a borda desenhada — nunca dá morte "injusta" por raspar 1 pixel |
| Raio do campo gravitacional (`R_grav`) | **92 px** | Cobre metade da altura da tela, mas sempre deixa um corredor seguro de ≥ 64 px no lado oposto |
| Aceleração máxima na borda letal (`G_max`) | **340 px/s²** | **Regra de ouro:** `G_max (340) < thrust (420)`. Mesmo perto do núcleo, segurar contra-empuxo vence a gravidade — mas exige reagir antes de acumular velocidade para dentro |
| Zona de alerta crítico (`d < 44 px`) | `a_grav ≈ 170–340 px/s²` | O capacete do Pardo vibra, linhas de força convergem no corpo e o **Impulso de Escape** (botão Pulo) é ideal para romper o puxão imediatamente |
| Velocidade de passagem do planeta | **72 px/s** (relativa à tela) | Permanece visível na tela por ~5,1 segundos: longo o bastante para exigir manobra completa, curto o bastante para manter o ritmo |

#### Regras de ouro de Yuri & Yumi
1. **Colisão = Instakill absoluto.** Encostar na superfície de Planeta Yuri ou Planeta Yumi destrói o Pardo instantaneamente (animação de colapso gravitacional + perde 1 vida + retorna ao último checkpoint), **mesmo com 3 gotas cheias ou durante frames de invulnerabilidade**.
2. **Corredor seguro garantido.** Todo posicionamento de Yuri ou Yumi respeita `y ∈ [38, 142]` e nunca existe obstáculo sólido bloqueando o corredor oposto ao planeta.
3. **Moedas de "Estilingue Gravitacional".** Arcos de moedas frequentemente passam pela zona externa do campo gravitacional (`d ≈ 58–80 px`), recompensando jogadores habilidosos que surfam na borda do puxão sem cair no núcleo.
4. **Identidade dupla, mesma regra.** Planeta Yuri (tons quentes: terracota, âmbar e anel de poeira dourada) e Planeta Yumi (tons cósmicos: magenta, violeta e halo ciano) alternam aparições para variedade visual e personalidade — a leitura do anel gravitacional pulsante ao redor de ambos é idêntica, garantindo zero ambiguidade mecânica.

### 4.4. Dano, cura, checkpoints e morte

- **Inimigos e obstáculos comuns:** tocar causa **−1 gota** (de 3), pequeno recuo afastando da fonte e **1,0 s** de invulnerabilidade (piscando).
- **Planeta Yuri / Planeta Yumi:** **morte automática imediata** (perde 1 vida direto, ignora gotas e invulnerabilidade).
- **Cápsula de Água Espacial (`W`):** sachê/cilindro prateado com gota azul brilhante flutuando na rota; socar (ou tocar) libera **+1 gota** de hidratação com `fx('splash')`. Não fere em nenhuma hipótese.
- **0 gotas:** perde 1 vida e renasce no último checkpoint orbital.
- **Checkpoints orbitais (`K`):** boias luminosas que ativam automaticamente ao cruzar a coluna. Os 1,8 s seguintes a cada checkpoint são sempre livres de ameaças e de planetas, garantindo renascimento justo.
- **Avaliação da Missão:** ao vencer a fase, o jogador recebe de **1 a 5 estrelas** (começa com 5; perde 1 por dano sofrido e 2 por morte gravitacional, mínimo 1) com bônus de `500 × estrelas`.

---

## 5. Vocabulário da fase

Detalhes de sprite, hitbox, comportamento e pontos em [`gdd_bestiario_fase7.md`](gdd_bestiario_fase7.md).

| Resposta principal | Elemento | Estreia | Regra rápida |
|---|---|---|---|
| **CONTRA-EMPUXE / DESVIE (INSTAKILL)** | **Planeta Yuri** e **Planeta Yumi** | Ato 1 (Yuri) · Ato 2 (Yumi) | Puxam o Pardo no raio de 92 px; colisão mata na hora |
| **SOQUE** (ou desvie) | **Meteoro Comum** (`m`) | Embarque | 1 soco estilhaça (+150 pts); vem em linha reta |
| **DESVIE** (ou quebre antes) | **Meteoro Flamejante** (`M`) | Ato 1 | Rápido, rastro de fogo; 1 soco quebra em 2 fragmentos ou exige desvio |
| **CONTORNE** (não soca) | **Satélite em Órbita** (`s`) | Ato 1 | Painéis solares rígidos; soco rebate; bloqueia faixa horizontal |
| **DESVIE DO FEIXE** | **Satélite de Varredura** (`S`) | Ato 3 | Carrega 0,8 s e dispara feixe laser vertical/horizontal telegrafado |
| **SOQUE** | **OVNI Patrulheiro** (`u`) | Ato 2 | Voa em senoide; 1 soco derruba; dispara 1 bolinha de plasma telegrafada |
| **SOQUE** | **Alien de Jetpack** (`a`) | Ato 2 | Primo espacial do alien da Fase 2; avança mirando a altura do Pardo; 1 soco |
| **SOQUE** (ou desvie) | **Cometa de Gelo** (`g`) | Ato 2 | Diagonal rápida com trilha de aviso; 1 soco estilhaça (+300 pts + moeda) |
| **CONTORNE** (não soca) | **Lixo Espacial** (`d`) | Ato 1 | Sucata de foguete/painel girando; obstáculo rígido indestrutível |
| **SOQUE ANTES / DESVIE** | **Mina Orbital Magnética** (`b`) | Ato 3 | Parada; arma ao se aproximar (pisca vermelho); socável apenas desarmada |
| **REPOSICIONE** | **Rajada de Vento Solar** (`v`) | Ato 3 | Faixa horizontal telegrafada (1,0 s) que empurra para trás e fere |
| **SOBREVIVA / SOQUE ONDAS** | **Nave-Mãe Alienígena** (`N`) | Ato 4 | Clímax: acompanha pela direita por 12 compassos soltando OVNIs e plasma |

---

## 6. Estrutura e progressão (65 compassos = 780 colunas = ~2 min 10 s)

A fase usa estrutura musical em compassos de 12 colunas (2,0 s cada a 120 BPM), alternando trechos de alta tensão com respiros claros antes de cada passagem planetária.

| Trecho | Compassos (Colunas) | Cenário de fundo | O que ensina / cobra | Passagens Yuri / Yumi |
|---|---|---|---|---|
| **Embarque** | 1–4 (0–48) | Atmosfera superior virando espaço | Testar jetpack 2D, amortecimento zero-G, Impulso de Escape e primeiros Meteoros Comuns | Nenhuma |
| **Ato 1 — Cinturão de Sucata** | 5–17 (49–204) | Órbita baixa com o Ceará/Nordeste curvado ao fundo | Meteoros Comuns e Flamejantes, Satélites em Órbita e Lixo Espacial; **1ª passagem solo do Planeta Yuri** | 2× Planeta Yuri (1 solo, 1 com moedas) |
| **Checkpoint 1 + Respiro** | 18 (205–216) | Transição para espaço aberto | Cápsula de Água (`W`) + fila de moedas | — |
| **Ato 2 — Fronteira dos Aliens** | 19–32 (217–384) | Nebulosa azul-violeta e estrelas densas | Estreia de OVNIs Patrulheiros, Aliens de Jetpack e Cometas de Gelo; **estreia do Planeta Yumi** | 1× Planeta Yumi + 1× Planeta Yuri (com inimigos leves) |
| **Checkpoint 2 + Respiro** | 33 (385–396) | Setor de asteroides luminosos | Cápsula de Água (`W`) + moedas | — |
| **Ato 3 — Corredor Gravitacional** | 34–48 (397–576) | Espaço profundo com poeira estelar âmbar e magenta | Minas Orbitais, Satélites de Varredura, Rajadas de Vento Solar e **passagens escalonadas de Yuri → Yumi** (manobra em "S") | 2× Yuri + 2× Yumi (alternados em cima/baixo) |
| **Checkpoint 3 + Respiro** | 49 (577–588) | Aproximação da Estação Espacial | Cápsula de Água (`W`) + aviso da Nave-Mãe | — |
| **Ato 4 — Escolta da Nave-Mãe** | 50–61 (589–732) | Nebulosa vibrante com a Estação ao longe | Nave-Mãe presa à direita soltando OVNIs e plasma enquanto Yuri e Yumi fazem passagem final dramática | 1× Yuri + 1× Yumi (clímax final) |
| **Final — Acoplagem EEIQ** | 62–65 (733–780) | Estação Espacial de Quixadá iluminada | Pacífico; desaceleração automática e cutscene de acoplagem | Nenhuma |

---

## 7. Direção de arte, cenário e áudio

### 7.1. Parallax em 4 camadas (`src/gfx/background7.ts`)
1. **Fundo profundo (0,05×):** vazio cósmico azul-marinho quase preto (`#07091a`) com nebulosas sutis em degradê índigo, roxo e magenta conforme o ato avança.
2. **Horizonte planetário (0,15×):** no Ato 1, a curvatura iluminada da Terra (com a silhueta do litoral nordestino) gira lentamente na base da tela; nos Atos 2–4, dá lugar a constelações, galáxias espirais distantes e a silhueta da Estação Espacial crescendo ao longe.
3. **Plano médio (0,40×):** cinturão distante de asteroides silhuetados, satélites inativos ao fundo e estrelas médias piscando em 2 quadros.
4. **Primeiro plano / Velocidade (1,15×):** poeira cósmica e estrelas-risco (*speedlines* sutis de 2–4 px) passando rápido para dar sensação constante de deslocamento orbital sem poluir a leitura de projéteis.

### 7.2. Paleta e leitura visual
- **Pardo Astronauta:** amarelo vivo + azul jeans + cúpula azul-claro translúcida (`rgba`/dithering 8-bit) preservando a **máscara preta** e os óculos no centro do rosto.
- **Perigo Gravitacional (Yuri & Yumi):** anéis concêntricos tracejados puxando para dentro + partículas orbitais convergindo + borda de aviso pulsante.
- **Destrutíveis no Soco:** contorno claro com acentos laranja-brasa (meteoros), verde-limão (aliens/OVNIs) ou azul-cristal (cometa de gelo).
- **Indestrutíveis (Desvie):** cinza aço + azul-escuro de painel solar + faixas zebradas amarelo/preto nas pontas de sucata e feixe laser branco/vermelho.

### 7.3. Áudio (`src/audio/audio.ts`)
- **Trilha `'space'`:** chiptune synthwave / 8-bit espacial a **120 BPM em 4/4**, baixo arpejado pulsante (estilo *Mega Man* / *Gradius*), melodia principal em onda quadrada com eco suave e viradas de bateria eletrônica a cada 4 compassos.
- **SFX novos:**
  - `jet_burst`: jato agudo com ruído branco filtrado ao usar o Impulso de Escape.
  - `grav_warn`: bipe duplo grave de radar quando Yuri ou Yumi entram em rota.
  - `grav_hum`: zumbido grave sutil cuja intensidade escala quando o Pardo entra no raio `R_grav`.
  - `grav_kill`: implosão grave + estática retrô na colisão com Yuri/Yumi.
  - `meteor_break`: estalo rochoso grave ao socar meteoro/cometa.
  - `laser_charge` / `laser_fire`: carregamento crescente e disparo seco do satélite de varredura.
  - `ufo_zap`: disparo clássico 8-bit de plasma alienígena.

---

## 8. Final da fase — Estação Espacial de Quixadá (EEIQ)

1. Ao entrar no compasso 62, a Nave-Mãe recua em fuga para fora da tela e a rolagem desacelera suavemente ao longo de 2 compassos até parar diante da **Estação Espacial Internacional de Quixadá (EEIQ)** (com uma pequena bandeira do Ceará e o letreiro `EEIQ` em pixel art).
2. **Cutscene automática (`winning`):** o jogador solta os controles; o Pardo aciona um último jato suave, acopla na plataforma da estação, abre o visor do capacete (mantendo a máscara abaixada só para o gole!) e bebe o **Sachê de Água Espacial Gelada** enquanto gotinhas flutuam em gravidade zero ao redor.
3. Tela `FASE 7 CONCLUÍDA!`: Pardo Astronauta comemorando em zero-G, estrelas da avaliação orbital, contadores de moedas/tempo/pontos e a frase **"O PARDO ZEROU A GRAVIDADE EM ÓRBITA"**.

---

## 9. Contratos técnicos e validação

Seguindo a arquitetura do projeto (`AGENTS.md`):
- **`src/game/spaceRules.ts`** (sem imports): centraliza todas as constantes numéricas (`SPACE`, `PLANET_GRAV`, curvas de movimento e funções puras de distância/aceleração gravitacional), compartilhadas entre o runtime e o validador.
- **`src/game/level7.ts`**: mapa ASCII por compassos (`LEVEL7_BARS` → `LEVEL7_ROWS`, 780×11 tiles lógicos) + metadados de ondas e trajetórias dos planetas Yuri e Yumi.
- **`src/game/enemies7.ts` & `src/game/objects7.ts`**: implementação das entidades espaciais e dos planetas gravitacionais.
- **`src/gfx/art/space.ts` & `src/gfx/art/enemies7.ts`**: sprites em `RENDER_SCALE = 2×`, registrados em `src/gfx/spec.ts`, `src/gfx/atlas.ts` e `scripts/check-art.mjs`.
- **`scripts/check-level7.mjs`**: validador determinístico que verifica:
  1. Dimensões do mapa e ausência de tiles sólidos bloqueantes;
  2. Nenhum Planeta Yuri ou Yumi sobreposto a outro planeta sem corredor mínimo de **≥ 64 px** de passagem livre;
  3. Nenhum obstáculo rígido ou laser ativo na faixa segura oposta durante a passagem de Yuri/Yumi;
  4. Simulação de bot 2D provando que a fase é 100% completável sem dano usando apenas empuxo normal + Impulso de Escape + Soco Espacial.

---

## 10. Fora de escopo

- Tiro automático / arma de laser equipada no Pardo (quebraria a identidade do Soco da Caatinga).
- Combate de chefe tradicional com barra de vida na Nave-Mãe (ela funciona como evento de escolta cinematográfico, como o caminhão-baú da Fase 5).
- Rotação de 360° do sprite do Pardo ou câmera rotativa.
- Oxigênio drenando com o tempo (o capacete de astronauta resolve o ar; a mecânica de pressão aqui é a gravidade de Yuri/Yumi, evitando repetir a Fase 3).
- Física de colisão entre inimigos e os planetas (apenas o Pardo sofre a atração gravitacional, para manter as trajetórias 100% previsíveis e determinísticas).
