# PLAN-FASE7.md — Fase 7 "Espaço Sideral" (Órbita de Quixadá)

Leia antes: [`level-7-refs/gdd_fase7_espaco.md`](level-7-refs/gdd_fase7_espaco.md) (GDD), [`level-7-refs/gdd_bestiario_fase7.md`](level-7-refs/gdd_bestiario_fase7.md) (bestiário + `SPRITE_SPEC`), [`AGENTS.md`](AGENTS.md) (arquitetura), [`PLAN-FASE5.md`](PLAN-FASE5.md) (o outro autoscroller: compassos, regras puras sem imports, validador com bot) e [`PLAN-FASE6.md`](PLAN-FASE6.md) (molde de delegação).

**Status (26/11/2026): Etapa 0 concluída (GDD, bestiário e este plano commitados na branch `fase-7-espaco`). Próximo: Etapa 1.**

Este plano foi escrito para ser executado **AFK em cloud**: um **orquestrador (Claude Opus)** coordena e revisa; o código é escrito por **subagentes Gemini 4** escolhidos pela dificuldade (§6). Tudo o que o GDD deixou ambíguo já está decidido na §2 — o orquestrador **não deve parar para perguntar**; se surgir uma ambiguidade nova, decide pelo caminho mais conservador (menor regressão nas Fases 1–6), registra em §11 e segue.

---

## 0. Etapas

| Etapa | Quem | O quê | Pronto quando | Commit |
|---|---|---|---|---|
| **0** (feita) | — | GDD, bestiário, plano | Docs na branch | `docs(fase7): GDD, bestiário e plano` |
| **1** | 1 agente **Carbon** (CONTRATOS) + revisão do orquestrador | Contratos e stubs (§3) | `npm run typecheck` e `npm run check:art` passam; `?fase=7` carrega uma fase vazia sem crash | `feat(fase7): contratos e stubs` |
| **2** | **12 agentes em paralelo** (§6), arquivos exclusivos | Implementação | Cada um cumpre o próprio aceite (§7) | `feat(fase7): implementação (etapa 2)` |
| **2b** | LEVEL ↔ VALIDATOR em laço | Mapa passa no validador com bot | `node scripts/check-level7.mjs` → `level7 OK` | `feat(fase7): mapa validado` |
| **3** | Orquestrador + REVISOR (**Carbon**) + correções pontuais | Integração, regressão, QA (§8) | Critérios da §9 | `fix(fase7): integração e QA` |
| **4** | Orquestrador | Push + PR para `main` (sem merge) | PR aberto com relatório | — |

A Etapa 2 só começa com a Etapa 1 commitada: os contratos é que permitem doze agentes trabalharem sem se pisar.

---

## 1. Regras gerais do ambiente

- Node ≥ 22.15 (os `check-*.mjs` importam `.ts` direto). Rode `npm ci` no início.
- **Não inicie servidor de dev em subagente.** Só o orquestrador pode subir `npm run dev` na Etapa 3, se o ambiente tiver navegador/headless; se não tiver, a verificação é `build` + validadores + previews PNG de arte (abrir e inspecionar a imagem).
- Sem dependências novas (nem dev). Sem assets externos. Texto do jogo, comentários e docs em **pt-BR**.
- `PLAN.md`, `lore.md`, `prompt.md`, `level-4-refs/` e `level-6-refs/` estão no `.gitignore` e **não existem no clone** — não dependa deles.
- Commits só pelo orquestrador, um por etapa, mensagens em pt-BR no padrão `feat(fase7): …`. Não commitar `.DS_Store`, `Trailers/`, `dist/`, `art-preview*.png`.

---

## 2. Decisões fechadas (resolvem ambiguidades do GDD)

| # | Decisão | Por quê |
|---|---|---|
| D1 | **Nova flag `Level.space?: boolean`** (zero-G + autoscroll espacial). A Fase 7 **não** liga `Level.autoscroll`. | Em todo o código `autoscroll` significa "Fase 5/Uber" (`prepareRide`, `uber_car` no `level.ts`, física de teto do carro no `player.ts`, `syncRideMusic`). Reusar quebraria a Fase 5. Helpers genéricos (rolagem da câmera, sincronia de música) podem ser extraídos, desde que a Fase 5 continue passando no `check-level5.mjs` e se comporte igual. |
| D2 | **Grade:** 780 colunas × 11 linhas (65 compassos × 12). Câmera `y = 0` travada: y de mundo = y de tela. Marcador ancorado no **centro da célula** (`x = col·16+8`, `y = row·16+8`). Ajuste fino de y vai em tabelas de metadados (`LEVEL7_PLANETS`, `LEVEL7_WAVES`). | Mesmo método da Fase 5 (`LEVEL5_BARS` → `LEVEL5_ROWS`). |
| D3 | **Determinismo:** tudo que não reage ao Pardo tem posição como **função pura de `camera.x`** em `spaceRules.ts` (ativa quando a coluna do marcador chega à borda direita da tela). Reativos (alien_jet mira Y, mina arma por proximidade, OVNI dispara por distância) usam funções puras de passo em `spaceRules.ts`, que o validador chama igual ao jogo. | O bot do validador precisa simular exatamente o runtime. |
| D4 | **Velocidade máxima** (`125 px/s`) limita a soma empuxo + gravidade. Durante a janela do Impulso (0,16 s) o limite sobe para `maxSpeed + 190`. Amortecimento só age quando o direcional está solto (por eixo). | Fecha "G_max < thrust" de forma testável. |
| D5 | **Corredor seguro** = em cada quadro de uma passagem, o intervalo vertical dentro de `y ∈ [18,162]` fora de `R_kill + 9 px` (meia-altura da hitbox) em pelo menos um lado do planeta, livre de obstáculo rígido/laser/vento, tem **≥ 64 px**. Consequência: centro do planeta em **`y ∈ [38,68] ∪ [112,142]`** (com onda ±16: base em `[38,52] ∪ [128,142]`). Dois planetas simultâneos: os corredores precisam se conectar (manobra em "S" deve ser viável para o bot). | GDD §4.3 diz "≥ 64 px no lado oposto" mas um planeta no meio da tela não deixa isso; esta é a leitura que cumpre a regra. |
| D6 | **Nave-Mãe:** corpo 64×56 centrado em x de tela 264; enquanto ativa, o limite direito do Pardo cai para `SPACE.motherMaxX = 216`. O corpo não fere (o Pardo nunca alcança); ferem os OVNIs, meteoros e plasma que ela solta. | GDD põe a nave em 264 e o Pardo vai até 288. |
| D7 | **Estrelas:** `spaceStars(hits, gravDeaths) = max(1, 5 − hits − 2·gravDeaths)`; bônus `500 × estrelas`. `GameState += gravDeaths: number`; `hits` reaproveita `rideHits` (zerado no `loadLevel`, como na Fase 5). Morte por 0 gotas não desconta além dos hits que a causaram. | GDD §4.4. |
| D8 | **Morte gravitacional:** `d ≤ R_kill` ignora gotas e invulnerabilidade; animação de colapso (~0,6 s: Pardo encolhe girando para o centro do planeta, `grav_kill`), depois o fluxo normal de morte/respawn. | GDD §4.3. |
| D9 | **Checkpoint `K`:** ativa ao cruzar a coluna. Respawn com a câmera em `Kx − 64` e o Pardo em x de tela 80, y 90, 3 gotas. Nenhuma ameaça nem telegraph de planeta pode estar ativo nos 1,8 s (= 172,8 px de rolagem) após o respawn — o validador confere. | GDD §4.4. |
| D10 | **Entrada:** novas ações `up` e `down` em `input.ts`. `ArrowUp`/`KeyW` → `['jump','up']`; `ArrowDown`/`KeyS` → `['down']` (saem do `SWALLOW`). Nova ação **`boost`**: `KeyX`, `KeyK`, `ShiftLeft`, `ShiftRight` e o botão touch PULO (`btn-jump` → `['jump','confirm','boost']`). Na Fase 7 o Pardo lê `left/right/up/down` para empuxo, `boost` para o Impulso e `punch` para o soco, e **ignora `jump`**. Touch: novos `#btn-up` e `#btn-down` em `index.html`, visíveis só com `body.space` (o `game.ts` alterna a classe ao carregar a fase). Fases 1–6 continuam idênticas. | Hoje não existe `up`/`down` e `ArrowUp` = pulo; sem isto o Pardo não voa em 8 direções nem no toque. |
| D11 | **Sprites do Pardo** em arquivo próprio `src/gfx/art/pardoSpace.ts` (precedente: `pardoSwim.ts`); `space.ts` fica com planetas, estação e objetos. | Permite dois agentes de arte em paralelo sem dividir arquivo. |
| D12 | **Telegraphs** (`⚠ YURI`/`⚠ YUMI`, `⚠ VENTO SOLAR`, linha tracejada do cometa, linha do laser) são desenhados **pela própria entidade** em coordenadas de tela, não pelo HUD. Planetas e Nave-Mãe entram em `NO_CULL_KINDS`. | Mantém o HUD só com texto e evita acoplamento. |
| D13 | **Fluxo de campanha:** vitória da Fase 6 passa a dizer `ENTER OU TOQUE PARA A FASE 7`; a nova tela `FASE 7 CONCLUÍDA!` (idx 6) termina com `ENTER OU TOQUE PARA JOGAR NOVAMENTE`. Fase Bônus intacta (continua entre 3 e 4). `?fase=7` funciona via `LEVEL_COUNT`. | GDD §8. |
| D14 | **Final:** compassos 62–63 desaceleram a rolagem até parar; 64–65 cutscene: Pardo vai sozinho até a doca da EEIQ (`A`), novo `DrinkItem` `'sache'`, sprite `pardo_space_drink` + `water_pouch`, gotinhas flutuando, `win`. | GDD §8. |
| D15 | **Cometa `g`:** direção pela linha do marcador (linhas 0–4 → desce; 6–10 → sobe; 45° de inclinação); telegraph 0,7 s. Socado: +300 e `st.coins += 1`. | Bestiário §3.3. |
| D16 | **Ondas da Nave-Mãe** declaradas em `LEVEL7_WAVES` (compasso, tempo, tipo, y), não geradas aleatoriamente. Nada de `Math.random` em lógica de jogo da Fase 7 (só em partículas). | Determinismo do validador. |
| D17 | **Hitbox do Pardo** 10×18 centrada no sprite 24×24 (offset fixo de desenho). `facing = +1` travado. | GDD §4.2. |

---

## 3. Contratos (Etapa 1 — agente CONTRATOS, Carbon)

O agente CONTRATOS é dono exclusivo destes arquivos na Etapa 1; depois deles, só o orquestrador os altera (pedidos de mudança vêm nos relatórios dos agentes).

1. **`src/game/spaceRules.ts`** (novo, **sem imports**, lido pelo validador): `SPACE` (scrollSpeed 96, bpm 120, beatCols 3, barCols 12, cols 780, rows 11, tile 16, thrust 420, maxSpeed 125, damping 4.2, punch {reach 18, active 0.12, total 0.24}, boost {dv 190, t 0.16, cooldown 1.4}, playerHitbox {w 10, h 18}, bounds {minX 20, maxX 288, minY 18, maxY 162}, motherMaxX 216, motherScreenX 264, invuln 1.0, checkpointGrace 1.8, stopBars 2, maxStars 5, starBonus 500); `PLANET_GRAV` (radius 24, rKill 21, rGrav 92, gMax 340, exponent 1.5, critical 44, speed 72, warnT 1.2, wave {amp 16, period 4}, yRanges D5); tabela `SPACE_ENEMIES` com hitbox/HP/velocidade/pontos do bestiário §3–4; funções puras: `planetPos(camX, def)`, `gravAccel(px, py, cx, cy) → {ax, ay, kill}`, `stepPlayerSpace(state, input, dt, planets)` (empuxo, amortecimento, clamp D4, boost), `meteorPos`, `cometPos`, `ufoPos`, `ufoShouldFire`, `alienJetStep`, `mineStep`, `beamState(t)`, `solarWindState(t)`, `scrollSpeedAt(camX)` (desaceleração final), `spaceStars`.
2. **`src/core/types.ts`**: `LevelTheme += 'space'` (logo `MusicTrack` também); `Level.space?: boolean`; `GameState.gravDeaths`; `SfxName += 'jet_burst' | 'grav_warn' | 'grav_hum' | 'grav_kill' | 'meteor_break' | 'laser_charge' | 'laser_fire' | 'ufo_zap'` (`clang` se não existir); `EnemyKind += 'meteor' | 'meteor_fire' | 'comet_ice' | 'ufo' | 'alien_jet' | 'space_mine'` (+ `'plasma_orb'` se projéteis forem `Entity`).
3. **`src/gfx/spec.ts`**, seção `FASE 7 — ESPAÇO SIDERAL`: todos os sprites do bestiário §7, com `pardo_space_*` apontando para `art/pardoSpace.ts` (D11). Acrescentar `solar_wind_tile [16,24,2]` (faixa desenhada por repetição em vez de um sprite de 320 px) e `planet_ring [16,16,2]` se o agente de objetos precisar de arte para os anéis (senão anéis são desenhados por código).
4. **`src/gfx/atlas.ts`** e **`scripts/check-art.mjs`**: importar e espalhar `SPACE_ART`, `PARDO_SPACE`, `ENEMIES7`.
5. **`src/game/level7.ts`**: cabeçalho, `LEVEL7_LEGEND`, `LEVEL7_BARS` com 65 compassos vazios válidos (spawn `P` no c.1 e `A` no c.65), `LEVEL7_ROWS` derivado, `LEVEL7_PLANETS: {col, kind:'yuri'|'yumi', y, wave?}[]`, `LEVEL7_WAVES` vazio.
   - **Legenda (contrato):** `.` vazio · `P` spawn · `K` checkpoint · `c` moeda · `W` cápsula d'água · `t` holograma (quadro pela ordem: 0 MOVA 2D, 1 IMPULSO, 2 GRAVIDADE) · `A` EEIQ · `Y` Planeta Yuri · `U` Planeta Yumi · `m` meteoro · `M` meteoro flamejante · `g` cometa · `u` OVNI · `a` alien de jetpack · `b` mina · `s` satélite · `S` satélite de varredura · `d` lixo espacial · `v` vento solar · `N` Nave-Mãe. **Nenhum tile sólido.**
6. **Stubs compiláveis:** `src/game/enemies7.ts` (`createSpaceEnemy(kind, x, y, variant?)`), `src/game/objects7.ts` (`createPlanet(def)`, `createWaterCapsule(x,y)`, `createBeacon(x,y)`, `createStation(x,y)`, `createHoloSign(x,y,frame)`, `createSatellite(x,y)`, `createBeamSatellite(x,y)`, `createDebris(x,y)`, `createSolarWind(x,y)`, `createMothership(x)`), `src/gfx/background7.ts`, `src/gfx/art/space.ts`, `src/gfx/art/pardoSpace.ts`, `src/gfx/art/enemies7.ts` (grades vazias do tamanho certo), `scripts/check-level7.mjs` (só dimensões + legenda).
7. **Registro mínimo:** `createLevel7()` em `level.ts` (theme `'space'`, `space: true`, sem tiles sólidos), `LEVELS` em `levels.ts`, BG `'space'` no seletor do `game.ts`. Deve ser possível abrir `?fase=7` e ver o Pardo parado num fundo vazio.
8. **Input/DOM (D10):** só as assinaturas — `Action += 'up' | 'down' | 'boost'` e os mapeamentos de teclado. Botões touch ficam com o agente INPUT.

Aceite da Etapa 1: `npm run typecheck`, `npm run check:art`, `node scripts/check-level7.mjs` (estrutura) e os validadores existentes (`check-level*.mjs` 1–6 e `check-bonus.mjs`) passam. O orquestrador revisa o diff inteiro antes do commit — especialmente `spaceRules.ts`, que é o coração do validador.

---

## 4. Estrutura da fase (para o agente LEVEL)

Partitura do GDD §6 (65 compassos). O agente LEVEL escreve primeiro `level-7-refs/level_design_fase7.md` (grade, regras e partitura compasso a compasso, no molde de `level-5-refs/level_design_fase5.md`) e depois o mapa.

| Trecho | Compassos | Conteúdo mínimo |
|---|---|---|
| Embarque | 1–4 | `P`, 2× `t` (MOVA 2D, IMPULSO), meteoros `m` isolados, moedas em linha |
| Ato 1 | 5–17 | `m`, `M`, `s`, `d`; `t` GRAVIDADE antes do 1º Yuri; **Yuri solo em corredor limpo** (±2 compassos sem nada); 2º Yuri com arco de moedas em `d ≈ 58–80` |
| CP1 | 18 | `K`, `W`, moedas |
| Ato 2 | 19–32 | estreia `u`, `a`, `g` (cada um isolado antes de combinar); 1× Yumi (estreia, limpo) + 1× Yuri com inimigos leves |
| CP2 | 33 | `K`, `W`, moedas |
| Ato 3 | 34–48 | `b`, `S`, `v`; 2× Yuri + 2× Yumi alternando cima/baixo, incluindo 1 par escalonado em "S" e ≥ 1 com `wave` |
| CP3 | 49 | `K`, `W`, moedas |
| Ato 4 | 50–61 | `N` no c.50; ondas em `LEVEL7_WAVES` (OVNIs, `M`, plasma); 1× Yuri + 1× Yumi finais |
| Final | 62–65 | nada que fira; desaceleração; `A` no c.65 |

**Regras de posicionamento (o validador cobra):** R1 planetas só nas faixas de D5; R2 cada mecânica estreia isolada (nenhum outro perigo na tela) — vale para os 6 inimigos, 4 obstáculos e os dois planetas; R3 nada rígido/laser/vento no corredor seguro durante passagem de planeta; R4 nada nos 1,8 s após cada `K` nem no início; R5 telegraph de planeta nunca coincide com telegraph de vento solar ou de laser; R6 no máximo 2 planetas na tela ao mesmo tempo, e só no Ato 3/4; R7 contagens mínimas: ≥ 6 passagens de planeta (3 Yuri + 3 Yumi pelo menos, alvo do GDD = 9), ≥ 3 `K`, ≥ 4 `W`, ≥ 120 moedas, ≥ 1 de cada inimigo/obstáculo da legenda; R8 `t` só no Embarque e antes do 1º Yuri.

---

## 5. Validador `scripts/check-level7.mjs` (para o agente VALIDATOR)

Importa `src/game/spaceRules.ts` e `src/game/level7.ts` direto (como o `check-level5.mjs`). Saída final exata `level7 OK` ou lista de falhas com compasso/tempo. Precisa rodar em **< 60 s**.

1. **Estático:** dimensões 780×11, legenda, ausência de tiles sólidos, `P` e `A`, contagens (R7), coerência `LEVEL7_PLANETS` ↔ marcadores `Y`/`U` (mesma coluna, mesmo tipo), faixas D5, R2, R4, R5, R6, R8.
2. **Corredor (D5/R3):** amostra a cada quadro de cada passagem; calcula o corredor livre usando as hitboxes reais de `SPACE_ENEMIES` e os estados de `beamState`/`solarWindState`.
3. **Bot 2D determinístico:** simula a 60 Hz com `stepPlayerSpace` e as funções puras de inimigos/planetas. Busca em feixe (beam search) sobre ações discretas a cada 6 quadros — 9 direções × {nada, boost, soco} — com heurística de distância às ameaças e preferência por posição neutra (x≈90, y≈90). Deve provar a fase **completa sem nenhum dano** do `P` até a parada final. Imprime: menor folga vertical em passagens de planeta, menor distância ao `R_kill`, nº de socos/boosts usados, menor janela de reação.
4. **Robustez:** segunda passada do bot com empuxo limitado a 85 % e sem boost nos Atos 1–2 (o início tem que ser jogável por iniciante); terceira passada a partir de cada `K` (respawn D9).
5. **Gotas:** cada `W` precisa estar em posição alcançável pelo bot em alguma rota sem dano (não precisa ser a mesma rota).

---

## 6. Donos dos arquivos e modelos

**Critério das famílias Gemini 4** (pesquisado em 26/11/2026): **Carbon** = raciocínio de fronteira, problemas difíceis multi-etapa; **Argon** = flagship de longo horizonte, ótimo para tarefas grandes e criativas com muita saída; **Neon** = intermediário forte em código multi-arquivo com molde pronto; **Hydrogen** = leve e rápido, para tarefas pequenas e bem especificadas.

| Agente | Arquivos (dono exclusivo) | Dificuldade | Família |
|---|---|---|---|
| ORQUESTRADOR | coordenação, revisão de diffs, contratos após a Etapa 1, commits, PR | — | **Claude Opus** |
| CONTRATOS (Etapa 1) | §3 inteiro | Alta — define a física e a API que todos usam | **Carbon** |
| CORE | `src/game/game.ts`, `src/game/player.ts`, `src/game/level.ts`, `src/game/levels.ts` | Alta — física zero-G, gravidade, morte por colapso, respawn D9, desaceleração e cutscene D14, estrelas D7, `body.space`, sem regredir Fases 1–6 e Bônus | **Carbon** |
| VALIDATOR | `scripts/check-level7.mjs` | Alta — bot 2D com busca, corredor D5, três passadas | **Carbon** |
| LEVEL | `src/game/level7.ts` (bars, `LEVEL7_PLANETS`, `LEVEL7_WAVES`), `level-7-refs/level_design_fase7.md` | Alta — design de 65 compassos com restrições espaciais | **Argon** |
| ART-PARDO | `src/gfx/art/pardoSpace.ts` | Alta — identidade do protagonista com capacete transparente, 6 sprites, 11 quadros | **Argon** |
| ART-WORLD | `src/gfx/art/space.ts` | Média-alta — planetas 96×96 px reais, EEIQ 160×128, cápsula, boia, holograma, sachê | **Argon** |
| ART-ENEMIES | `src/gfx/art/enemies7.ts` | Média — 11 sprites (Nave-Mãe 128×112 px reais) | **Neon** |
| ENEMY | `src/game/enemies7.ts` | Média — 6 máquinas de estado + plasma, molde em `enemies5.ts`/`enemies4.ts`, lógica nas funções de `spaceRules.ts` | **Neon** |
| OBJECTS | `src/game/objects7.ts` | Média — planetas (anéis, linhas de tração, telegraph), satélites, laser, lixo, vento, Nave-Mãe, coletáveis | **Neon** |
| BG | `src/gfx/background7.ts` | Média — 4 camadas, Terra no Ato 1, nebulosas por ato, EEIQ crescendo | **Neon** |
| AUDIO | `src/audio/audio.ts` | Média — faixa `'space'` 120 BPM + 8 SFX (`grav_hum` contínuo com intensidade) | **Neon** |
| INPUT | `src/core/input.ts` (botões), `index.html`, `src/style.css` | Baixa-média — `#btn-up`/`#btn-down` só com `body.space`, sem quebrar layout touch das outras fases | **Neon** |
| HUD | `src/game/hud.ts` | Baixa — intro `FASE 7`, idx 5 texto, tela idx 6 com estrelas e frase exata | **Hydrogen** |
| DOCS (Etapa 3) | `README.md`, `AGENTS.md`, `CLAUDE.md`, este plano (status) | Baixa | **Hydrogen** |
| REVISOR (Etapa 3) | só leitura + relatório | Alta — revisão de regressão de todo o diff contra `main` | **Carbon** |

**Escalonamento:** se um agente falhar no próprio aceite duas vezes, o orquestrador relança a tarefa (com o relatório da falha) na família acima: Hydrogen → Neon → Argon → Carbon. Agentes de arte que entregarem arte feia/ilegível no preview também sobem de família. O orquestrador só escreve código diretamente para ajustes de integração pequenos (≲ 60 linhas por arquivo); qualquer coisa maior vira tarefa de agente.

**Ordem de lançamento na Etapa 2:** todos em paralelo. LEVEL e VALIDATOR trabalham contra o mesmo `spaceRules.ts`; o LEVEL valida o próprio mapa com a parte estática do validador assim que o VALIDATOR a entregar (o orquestrador repassa). Etapa 2b: o orquestrador roda o validador completo e devolve as falhas ao LEVEL; até 4 rodadas, depois escala o LEVEL para Carbon. Se a falha for do bot (não do mapa), devolve ao VALIDATOR.

---

## 7. Aceite por agente

Todos: rodar `npx tsc --noEmit` no fim e corrigir erros dos **seus** arquivos; relatório final em ≤ 15 linhas (o que fez, números relevantes, pedidos de contrato, riscos).

- **CORE:** `?fase=7` jogável com fase vazia e com o mapa atual; Pardo voa em 8 direções com amortecimento; boost com cooldown; soco com alcance 18 px; colisão com planeta mata mesmo invulnerável; respawn D9; final D14; estrelas D7 na pontuação; `check-level5.mjs`, `check-level6.mjs` e `check-bonus.mjs` continuam OK; nenhum `if (level.autoscroll)` alterado de forma a mudar a Fase 5.
- **VALIDATOR:** detecta falhas plantadas (o agente testa localmente um mapa com planeta na faixa proibida, um `s` no corredor e um inimigo dentro do grace de `K`, e confirma que o validador acusa cada um; não commita esses mapas).
- **LEVEL:** `level_design_fase7.md` com partitura compasso a compasso; mapa passa nas checagens estáticas; Etapa 2b: `level7 OK`.
- **ART-\*:** `node scripts/check-art.mjs art-preview-<nome>.png <prefixos>` sem erros; **abrir o PNG e iterar** até ficar legível. Regras do `PLAN-FASE3.md §8`: `SpriteArt` em 2×, contorno `k`, 2–3 tons, olhando para a DIREITA. ART-PARDO: capacete transparente (reflexo no canto superior esquerdo, aro no pescoço), máscara preta e óculos visíveis em todos os quadros, mesmas cores do `pardo.ts`. Paleta: nenhuma cor nova sem pedir ao orquestrador; pedidos aprovados entram só via orquestrador em `palette.ts`.
- **ENEMY / OBJECTS:** comportamento igual ao bestiário usando as funções de `spaceRules.ts` (sem duplicar números); socáveis/indestrutíveis conforme bestiário; telegraphs D12.
- **BG:** 4 camadas com os fatores do GDD §7.1, troca por ato pelo `camera.x`, sem poluir a leitura de projéteis (camada de frente com alfa baixo).
- **AUDIO:** faixa `'space'` a 120 BPM exatos, loop com virada a cada 4 compassos; 8 SFX; `grav_hum` com API de intensidade (contrato: `audio.setHum?(0..1)` — se precisar, pedir no relatório e o orquestrador adiciona em `AudioApi`); mute respeitado.
- **INPUT:** teclado D10; botões cima/baixo aparecem só na Fase 7 em toque; Fases 1–6 sem mudança perceptível.
- **HUD:** intro `FASE 7` · `ESPAÇO SIDERAL` · `ÓRBITA DE QUIXADÁ`; HUD de gotas/moedas/vidas igual às outras fases; tela final com Pardo Astronauta, estrelas, contadores e a frase exata **"O PARDO ZEROU A GRAVIDADE EM ÓRBITA"**.

---

## 8. Integração e QA (Etapa 3)

1. Orquestrador: `npm run build`, `npm run check:art`, `node scripts/check-level.mjs`, `check-level2.mjs` … `check-level7.mjs`, `check-bonus.mjs`. Tudo verde.
2. Abrir e inspecionar os previews PNG de `pardo_space`, `planet_`, `eeiq`, inimigos da Fase 7.
3. Se houver navegador headless no ambiente: `npm run dev` e abrir `?fase=7`, `?fase=6` (vencer → Fase 7) e `?fase=5` (regressão do Uber); usar o `window.__pk` de debug do `main.ts` para pular trechos. Se não houver, registrar no PR que o teste manual fica com o João.
4. REVISOR (Carbon) lê `git diff main...HEAD` e lista riscos de regressão nas Fases 1–6/Bônus, código morto, números duplicados fora de `spaceRules.ts`, `Math.random` em lógica, textos fora de pt-BR. O orquestrador despacha as correções para os donos dos arquivos (mesma família ou acima).
5. DOCS (Hydrogen): README (Fase 7, controles novos `↑↓`, `X/K/Shift` = Impulso, `?fase=7`), `AGENTS.md`/`CLAUDE.md` (Fase 7 na lista de fases, `spaceRules.ts`, `check-level7.mjs`, `Level.space`), status deste plano.

---

## 9. Critérios de aceite finais

- `npm run build` sem erros; `check-art` sem ausentes/erros; `check-level.mjs` … `check-level7.mjs` e `check-bonus.mjs` OK.
- Fases 1–6 e Bônus intactas (validadores + revisão). Fase 6 → Fase 7 → acoplagem na EEIQ → tela final com a frase exata → jogar novamente.
- Planetas puxam (sente-se o puxão), matam no toque, sempre com telegraph de 1,2 s e corredor D5. Soco é a única arma.
- Controles por teclado e toque (com cima/baixo) funcionam na Fase 7.
- Música própria a 120 BPM com mute.
- PR aberto de `fase-7-espaco` para `main` com: resumo, saída dos validadores (incluindo as métricas do bot), decisões novas (§11), o que ficou para teste manual.

---

## 10. Regras para subagentes

Iguais às dos planos anteriores: edite **só** os seus arquivos; não altere contratos (faltou algo → faça o melhor dentro do contrato e peça no relatório); TypeScript estrito, `import type` para tipos; sem dependências nem assets externos; comentários e textos em pt-BR; sem `Math.random` em lógica da Fase 7; não faça commits; não inicie servidor de desenvolvimento; scripts auxiliares de geração de arte podem ser usados mas não são commitados (salvar em `/tmp`).

---

## 11. Registro de decisões durante a execução

*(O orquestrador acrescenta aqui toda decisão nova tomada durante a execução AFK, com data e motivo.)*
