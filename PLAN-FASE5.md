# PLAN-FASE5.md — Fase 5 "Marginal de São Paulo" (autoscroller no Uber), versão 2

Leia antes: [`level-5-refs/gdd_fase5_marginal.md`](level-5-refs/gdd_fase5_marginal.md) (GDD), [`level-5-refs/gdd_bestiario_fase5.md`](level-5-refs/gdd_bestiario_fase5.md) (carro, inimigos, obstáculos) e [`level-5-refs/level_design_fase5.md`](level-5-refs/level_design_fase5.md) (grade, regras e partitura). A Fase 6 segue em `PLAN-FASE6.md`.

**Status (18/11/2026): design escrito, aguardando aprovação; execução ainda não iniciada.** Branch `fase5-uber-rework`.

## 0. Por que refazer

A primeira versão era uma fase de plataforma (ônibus para escalar, passarelas, plataformas móveis, rota alta, coolers, blocos `?`) com rolagem a 80 px/s por cima. A versão 2 é um autoscroller linear: pista única a 120 px/s, tudo vem de frente, três respostas (pule, soque, não pule), inimigos de 1 soco com posição em função da câmera e mapa escrito em compassos da trilha (150 BPM, 12 colunas por compasso).

**O que se aproveita:** a infraestrutura de `Level.autoscroll`, o tema `'uber'`, os sprites `uber_car` e `uber_goal` (se passarem na revisão de arte), a faixa `'uber'` (ajustada para 150 BPM exatos) e os SFX `rev` e `horn`.
**O que é reescrito por inteiro:** `level5.ts`, `check-level5.mjs`, `enemies5.ts`, `objects5.ts`, `art/enemies5.ts`, quase todo `art/uber.ts`, `background5.ts` e o trecho de autoscroll de `player.ts`/`game.ts`.

## 1. Etapas

| Etapa | Quem | O quê | Pronto quando |
|---|---|---|---|
| **0** (feita) | Agente Sonnet + orquestrador | Branch, renomeação Uber → 5 e Transportadora → 6 (commit `e5b6939`), GDD, bestiário, level design e este plano | Docs no repositório |
| **1** | **Orquestrador, sozinho** | Contratos e stubs (§2) | `npm run typecheck` e `npm run check:art` passam com stubs |
| **2** | **9 agentes em paralelo** | Um módulo cada, com arquivos exclusivos (§3) | Cada um entrega com o próprio critério de aceite |
| **3** | Orquestrador + 1 agente revisor | Integração, QA e ajuste fino (§5) | Critérios da §6 |

A Etapa 2 só começa com a Etapa 1 commitada: os contratos são o que permite nove agentes trabalharem sem se pisar.

## 2. Contratos (Etapa 1 — orquestrador)

- **`src/game/uberRules.ts`** (novo, sem imports, lido também pelo validador): bloco `UBER` (velocidade 120, direcional ±40, faixa de tela 48–176, teto em y = 144, câmera Y = 12, invulnerabilidade 1,0 s, 150 BPM, 12 colunas por compasso, rampa de 12 colunas × 40 px), zonas que ferem, tabela dos inimigos e as funções puras `uberEnemyX`, `uberDronePos`, `uberRampOffset` e `uberStars`. `UBER_SPEED` sai de `constants.ts`.
- **`src/core/types.ts`**: `GameState += rideHits: number` (gotas perdidas na fase, para as estrelas); `SfxName` mantém `rev`/`horn` e reutiliza `beep`, `crate`, `break`, `water`; `EnemyKind` mantém `'motoboy' | 'drone' | 'patinete' | 'pichador'`. O dano continua em `onTouchPlayer`.
- **`src/gfx/spec.ts`**, seção FASE 5: remove os sprites listados no §6 do bestiário e declara os novos: `motoboy`, `motoboy_fast`, `patinete`, `drone`, `drone_dive`, `pichador_rapel`, `spray_cloud`, `caixa`, `obst_limitador`, `obst_faixa`, `obst_placa`, `portico_post`, `obst_luminaria`, `barreira_cet`, `isopor_agua`, `rampa_obra`, `truck_bau`, `tutorial_sign`, mais `uber_car`, `uber_goal`, `tile_ub_top`, `tile_ub_ground` e a decoração que fica. Tamanhos no bestiário.
- **`src/game/level5.ts`**: cabeçalho, `LEVEL5_LEGEND` (legenda do §2 do level design), `LEVEL5_BARS` com 74 compassos vazios válidos e `LEVEL5_ROWS` derivado. Sai `LEVEL5_MOVERS`.
- **Assinaturas** (stubs compiláveis): `createUberEnemy(kind, encontroX, variante?)`, `createCaixa(encontroX, alta)`, `createObstaculo(tipo, x)`, `createBarreira(x)`, `createIsopor(x)`, `createRampa(x)`, `createTruckBau(x)`, `createUberCar(x)`, `createUberGoal(x, footY)`; `createTutorialSign(x, quadro)`. As funções puras ficam em `uberRules.ts`.

## 3. Delegações (Etapa 2)

Cada agente recebe: este plano, os três documentos de `level-5-refs/`, `AGENTS.md` e a lista dos seus arquivos. Ninguém edita arquivo de outro dono; o que faltar em contrato vai no relatório final, não no código alheio.

| Módulo | Arquivos (dono exclusivo) | Modelo | Por que esse modelo |
|---|---|---|---|
| **CORE** | `src/game/player.ts`, `src/game/game.ts`, `src/game/level.ts`, `src/game/levels.ts` | Opus 5.5 | Mexe em código compartilhado por todas as fases; precisa preservar as outras cinco |
| **LEVEL** | `src/game/level5.ts`, `scripts/check-level5.mjs` | Fable 5.2 | É o coração do redesenho: ritmo, justiça e um validador novo com bot |
| **ENEMY** | `src/game/enemies5.ts` | Opus 5.5 | Lógica pequena, mas os tempos são contrato |
| **OBJECTS** | `src/game/objects5.ts` | Opus 5.5 | Carro, rampa e caminhão-baú interagem com o CORE |
| **ART-ENEMIES** | `src/gfx/art/enemies5.ts` | Opus 5.5 | A arte anterior foi um dos pontos fracos |
| **ART-UBER** | `src/gfx/art/uber.ts` | Opus 5.5 | Idem; define a leitura por cor dos obstáculos |
| **BG** | `src/gfx/background5.ts` | Opus 5.5 | Quatro cenários e a sensação de velocidade |
| **AUDIO** | `src/audio/audio.ts` | Sonnet 5.5 | Ajuste de andamento e pouco SFX |
| **HUD-DOCS** | `src/game/hud.ts`, `README.md`, `AGENTS.md` | Sonnet 5.5 | Mudanças mecânicas e bem delimitadas |

### 3.1. Briefing por agente

**CORE** — GDD §4. Em `level.autoscroll`:
- Câmera X avança a `UBER.speed`; câmera Y travada em `UBER.camY`. Desacelera e para nos 3 últimos compassos.
- Pardo: `facing = +1` travado; `vx = UBER.speed + dir × UBER.steer`; x limitado a `camera.x + [screenMin, screenMax]`; mesmo pulo e mesmo soco. Chão = teto do carro (`roofY − rampOffset`), grudando no teto enquanto `onGround` (sem quicar na descida da rampa).
- `hurt` em autoscroll: sem empurrão horizontal, `invuln = UBER.invuln`, `state.rideHits++`. Remover o código de esmagamento na borda esquerda.
- Checkpoint por passagem de coluna; renascer com `camera.x = Kx − screenNeutral` e reiniciar a música.
- `level.ts`: tabela de marcadores do §2 do level design; `createLevel5` sem `movers`. Vitória: bônus `500 × estrelas`.
- Aceite: `?fase=5` jogável do começo ao fim com stubs de arte; as outras fases sem diferença (todos os `check-level*.mjs` passam); typecheck limpo.

**LEVEL** — level design inteiro. Escreve os 74 compassos de `LEVEL5_BARS` a partir da partitura e o validador novo (§5 do level design). Pode ajustar a partitura dentro da margem descrita no fim do §7. Aceite: `node scripts/check-level5.mjs` passa nas duas passadas, sem avisos de robustez no Ato 1, e `--print` mostra a janela em quadros de cada decisão.

**ENEMY** — bestiário §1 e §3. Quatro inimigos e as caixas, todos com posição por `uberEnemyX`, sem IA reativa, 1 soco. Aceite: os tempos de aviso do drone e as velocidades batem com a tabela; nenhum inimigo guarda estado que mude entre duas passagens pelo mesmo checkpoint.

**OBJECTS** — bestiário §2, §4 e §5. Carro (unidade com o Pardo, inclinação, faróis), quatro obstáculos, barreira, isopor, rampa, caminhão-baú, objetivo. Aceite: zonas que ferem exatamente como na tabela do bestiário; o caminhão fica 8 compassos e sai.

**ART-ENEMIES** e **ART-UBER** — bestiário (colunas de sprite e parágrafos de visual) e GDD §7. Arte em 2×. Regra de cor: zebrado = pule, verde/luz branca = não pule, laranja/vermelho com contorno claro = soque. Aceite: `npm run check:art` diz "arte OK" e, no PNG de preview, cada sprite é reconhecível a 1× sem legenda; `UBER` legível na porta e motorista visível.

**BG** — GDD §7. Quatro trechos com troca nas colunas das rampas (compassos 22, 40 e saída do túnel no 57), do escuro ao amanhecer; camada de primeiro plano com linhas de velocidade; teto do túnel alinhado à linha 4 para as luminárias fazerem sentido. Aceite: nenhuma camada tem contraste que dispute com a faixa baixa ou a faixa alta.

**AUDIO** — faixa `'uber'` a 150 BPM exatos, 4/4, frases de 4 compassos, com início de laço em fronteira de frase; expõe reinício limpo para o renascimento. SFX: `rev`, `horn`, e confirmar `beep`, `crate`, `break`. Aceite: 16 compassos da faixa duram 25,6 s.

**HUD-DOCS** — cartão de intro, tela de vitória com `AVALIAÇÃO DA CORRIDA` em estrelas e bônus, dica de controles da fase no README, e a seção de arquitetura do `AGENTS.md` descrevendo a Fase 5 nova (compassos, posição por câmera, validador com bot). Aceite: nenhuma menção a ônibus, coolers, plataformas móveis ou `UBER_SPEED` sobra nos docs.

## 4. Dependências entre agentes

Todos dependem só da Etapa 1. Três pontos de contato para o orquestrador vigiar na integração:

1. **LEVEL ↔ ENEMY/OBJECTS:** o validador porta `uberEnemyX`, `rampOffset` e as zonas que ferem. Se ENEMY ou OBJECTS mudarem um número, o validador muda junto.
2. **CORE ↔ OBJECTS:** quem move o Pardo na rampa é o CORE; quem informa a altura é `rampOffset`.
3. **BG ↔ LEVEL:** as colunas de troca de cenário saem dos marcadores `J` e `K` do mapa, não de números fixos no parallax.

## 5. Etapa 3 — integração e QA (orquestrador)

1. `npm run typecheck`, `npm run build`, `npm run check:art`, todos os `check-level*.mjs` e `check-bonus.mjs`.
2. Jogar `?fase=5` no navegador do início ao fim, três vezes: só com pulo e soco; usando o direcional; e errando de propósito para ver dano, estrelas e os três checkpoints.
3. Um agente revisor independente (Opus 5.5) recebe o diff e os documentos, sem o resumo do orquestrador, e confere design contra implementação.
4. Ajuste fino de densidade com o dono do mapa, se algum compasso parecer injusto jogando.
5. Commit por módulo, PR para `main`.

## 6. Critérios de aceite da fase

- Nenhum tile sólido acima da pista, nenhuma plataforma, nenhuma rota alternativa.
- Todo inimigo morre com 1 soco; a fase fecha no validador só com pulo e soco, sem dano, no envelope reduzido.
- Rolagem a 120 px/s, 74 compassos, 3 checkpoints, 3 rampas, comboio do caminhão-baú no Ato 4.
- Estreias na ordem do GDD §5, cada verbo com sua placa de tutorial.
- Tela de vitória com estrelas; Fase 6 abre em seguida; demais fases intactas.
