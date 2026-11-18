# PLAN-FASE-UBER.md — Fase 5 "Marginal de São Paulo" (Autoscroller no Uber) & Fase 6 "Transportadora"

Leia também: [`uber-refs/gdd_fase_uber.md`](uber-refs/gdd_fase_uber.md) (GDD completo da fase e física do autoscroller), [`uber-refs/gdd_bestiario_uber.md`](uber-refs/gdd_bestiario_uber.md) (carro preto da Uber com motorista visível e bestiário de 1 golpe), `PLAN-FASE5.md` e `PLAN-BONUS.md`.

**Status: plano aprovado para execução autônoma pelo ORQUESTRADOR com subagentes.**

## 0. Etapas de Execução

1. **Etapa 0 (concluída):** Criação da branch `feat/fase-uber-autoscroller`, GDD (`uber-refs/gdd_fase_uber.md`), bestiário (`uber-refs/gdd_bestiario_uber.md`) e este plano (`PLAN-FASE-UBER.md`).
2. **Etapa 1 — ORQUESTRADOR escreve os contratos e stubs** (sozinho, antes de paralelizar) até `npm run typecheck` passar sem erros.
3. **Etapa 2 — 9 subagentes em paralelo**, cada um dono exclusivo dos seus arquivos (§6).
4. **Etapa 3 — ORQUESTRADOR faz QA completo e abre o PR:** `npm run typecheck`, `node scripts/check-art.mjs` (+ inspeção dos PNGs de preview), `node scripts/check-level.mjs` … `check-level6.mjs`, `node scripts/check-bonus.mjs`, `npm run build`, commit e criação do Pull Request para a `main`.

## 1. Contratos (Etapa 1 — ORQUESTRADOR)

- **`src/core/types.ts`**:
  - `LevelTheme` += `'uber'`.
  - `SfxName` += `'rev' | 'horn'`.
  - `EnemyKind` += `'motoboy' | 'drone' | 'patinete' | 'pichador'`.
  - `Level` += `readonly autoscroll?: boolean;`.
- **`src/core/constants.ts`**:
  - `export const UBER_SPEED = 80;` (velocidade horizontal do autoscroller da Fase 5 em px/s).
- **`src/gfx/spec.ts`**, seção `FASE 5 — MARGINAL DE SÃO PAULO (AUTOSCROLLER NO UBER)`:
  - Carro da Uber & Objetivo (`src/gfx/art/uber.ts`):
    - `uber_car: [64, 24, 2]` — carro sedã preto com escrito `"UBER"` em branco na porta, motorista visível pela janela ao volante, rodas girando e faróis acesos.
    - `uber_goal: [32, 40, 2]` — totem/placa luminosa `"UBER 5★"` de desembarque na portaria da Transportadora.
  - Inimigos do Bestiário (`src/gfx/art/enemiesUber.ts`) — todos de 1 golpe:
    - `motoboy: [28, 22, 2]`, `motoboy_wheelie: [28, 24, 1]`
    - `drone: [20, 16, 2]`, `drone_dive: [20, 16, 1]`
    - `patinete: [20, 24, 2]`, `patinete_jump: [20, 24, 1]`
    - `pichador: [20, 24, 2]`, `pichador_throw: [22, 24, 2]`, `lata: [8, 8, 2]`
  - Mundo & Decoração da Marginal (`src/gfx/art/uber.ts`):
    - Tiles: `tile_ub_top: [16, 16, 2]`, `tile_ub_ground: [16, 16, 2]`, `tile_ub_rock: [16, 16, 3]`, `tile_ub_spike: [16, 16, 1]`, `tile_ub_block: [16, 16, 1]`, `tile_ub_block_item: [16, 16, 1]`, `tile_ub_oneway: [16, 16, 1]`.
    - Objetos: `cooler_uber: [16, 32, 2]`, `platform_drone: [32, 10, 1]`, `platform_beam: [32, 10, 2]`.
    - Decoração: `bus_front: [40, 48, 1]`, `bus_wheels: [48, 16, 1]`, `marginal_sign: [24, 24, 1]`, `speed_radar: [16, 32, 1]`, `street_light: [16, 48, 1]`, `traffic_cone: [8, 12, 1]`.
- **`src/gfx/atlas.ts` e `scripts/check-art.mjs`**: importar e espalhar `UBER` (`src/gfx/art/uber.ts`) e `ENEMIES_UBER` (`src/gfx/art/enemiesUber.ts`).
- **Stubs compiláveis**: `src/gfx/art/uber.ts`, `src/gfx/art/enemiesUber.ts`, `src/gfx/backgroundUber.ts`, `src/game/enemiesUber.ts`, `src/game/objectsUber.ts`, e `src/game/levelUber.ts` com cabeçalho + legenda (contrato).

## 2. Reordenação, Narrativa e Mecânica do Autoscroller (CORE + HUD)

- **Ordem em `src/game/levels.ts`**:
  - `LEVELS = [createLevel1, createLevel2, createLevel3, createLevel4, createLevelUber, createLevel5]` (`LEVEL_COUNT = 6`).
  - `createLevelUber` (`index: 4`, Fase 5): `"MARGINAL DE SÃO PAULO"`, `theme: 'uber'`, `autoscroll: true`.
  - `createLevel5` (`index: 5`, Fase 6): `"TRANSPORTADORA DE SÃO PAULO"`, `theme: 'sampa'`.
- **Física do Autoscroller (`game.ts` + `player.ts` + `objectsUber.ts`)**:
  - Em `level.autoscroll`:
    - A câmera avança a `UBER_SPEED` (`80 px/s`) enquanto `camera.x < level.widthPx - VIEW_W - 1`. Ao morrer e renascer em um checkpoint `K`, `snapCamera()` posiciona `camera.x = clamp(player.x - 72, 0, level.widthPx - VIEW_W)`.
    - O Pardo move-se em relação à velocidade-base `baseVx = scrolling ? UBER_SPEED : 0` (`target = baseVx + dirIn * PHYS.runMax`), preservando `baseVx` nos pulos para pousar perfeitamente de volta no teto do Uber, e limitando `player.x` às margens da câmera (`camera.x + 6` a `camera.x + VIEW_W - 8 - player.w`), com dano/ejeção anti-esmagamento se bloqueado por parede sólida contra a borda esquerda.
    - O carro preto da Uber (`createUberCar`) acompanha o Pardo na linha 10 com teto pisável `platform: true` em `y = 10 * TILE` (`160 px`) onde há asfalto (`Tile.GroundTop`) na linha 11, e mergulha pela rampa inferior (`platform: false`) nos vãos de viaduto sem asfalto na linha 11.
- **Telas de Intro e Vitória (`hud.ts`)**:
  - `drawTitle`: atalho de modo teste aceita `?fase=2` a `?fase=6` (e `?fase=bonus`).
  - `drawIntro`: tema `'uber'` (painel noturno azul-asfalto/neon com subtítulo `"DE UBER ATÉ O GALPÃO"`).
  - `drawWin`:
    - `idx === 4` (Fase 5 — Marginal de São Paulo): exibe o carro preto da Uber (`uber_car`), Pardo bebendo a água de cortesia (`pardo_drink_mineral`) e `mineral_bottle`, contadores, frase **"O PARDO CHEGOU DE UBER"** / **"5 ESTRELAS NA TRANSPORTADORA"** e `"ENTER OU TOQUE PARA A FASE 6"`.
    - `idx === 5` (Fase 6 — Transportadora de São Paulo): exibe `FASE 6 CONCLUÍDA!`, Renan Maia (`maia_cheer`), Pardo bebendo café (`pardo_drink_coffee`), `"O PARDO TOMOU O CAFÉ NA TRANSPORTADORA"` e `"ENTER OU TOQUE PARA JOGAR NOVAMENTE"`.

## 3. Inimigos (ENEMY-UBER, `src/game/enemiesUber.ts`) — Todos com 1 Golpe!

| Inimigo | Hitbox · pts | IA | Soco |
|---|---|---|---|
| `motoboy` | 22×18 · 300 | Patrulha ~36 px/s; a ≤ 8 tiles empina a moto por 0,32 s (`rev`, `motoboy_wheelie`) e arranca a ~95 px/s por 0,85 s. | **1** |
| `drone` | 16×12 · 250 | Flutua em senoide ±5 px; a ≤ 6,5 tiles telegrafa 0,35 s (`drone_dive`) e faz rasante diagonal (~80 px/s) até a altura do Pardo. | **1** |
| `patinete` | 14×20 · 200 | Desliza a ~45 px/s; a ≤ 5 tiles salta com o patinete (`vy = -215`, `boing`, `patinete_jump`). | **1** |
| `pichador` | 12×20 · 350 | Parado no alto; a ≤ 8,5 tiles espera 1,4 s → aviso 0,4 s → atira `lata` 8×8 em arco (`vx = 95`, `vy = -170`, `g = 480`; `throw`). Lata: 1 de dano, socável (+10 pts). | **1** |

## 4. Objetos e Carro da Uber (OBJECTS-UBER, `src/game/objectsUber.ts`)

- `createUberCar(spawnX, roadTopY)`: entidade `uber_car` (`64×24`, `platform: true`, `dx: 0, dy: 0`), farol projetado à frente, faíscas ocasionais e acompanhamento do Pardo no autoscroll.
- `createCoolerUber(x, y)`: molde do `createBebedouro` (até 3 gotas a socos, frame 1 = vazio).
- `createUberGoal(centerX, footY)`: objetivo `kind: 'uber_goal'` (`32×40`), toca `'horn'` ao vencer e brilha no desembarque.

## 5. Level Design (LEVEL-UBER, `src/game/levelUber.ts` + `scripts/check-level6.mjs`)

- Mapa ASCII `240×14` em 4 atos (Entrada da Marginal → Viadutos do Tietê → Minhocão & Hora do Rush → Desembarque na Transportadora).
- Validador `scripts/check-level-uber.mjs` (e `scripts/check-level6.mjs` para a Fase 6): valida dimensões, legenda, contagens mínimas, ônibus/furgões (`R` + `w` + `b`), vãos com água do Tietê (`~`), distâncias seguras de spawn/checkpoints, zona pacífica de desembarque e simulação de alcançabilidade do Pardo com o teto do Uber em `y = 160` nas colunas com asfalto `=` na linha 11.

## 6. Donos Exclusivos dos Arquivos (Etapa 2)

| Módulo | Arquivos (dono exclusivo) | Responsabilidade |
|---|---|---|
| **ORQUESTRADOR** | `src/core/types.ts`, `src/core/constants.ts`, `src/gfx/spec.ts`, `src/gfx/atlas.ts`, `scripts/check-art.mjs`, QA final e PR | Contratos, stubs compiláveis, validação integrada, build e PR |
| **ART-UBER** | `src/gfx/art/uber.ts` | Carro preto `uber_car` (escrito UBER + motorista visível), `uber_goal`, 7 tiles, 3 objetos e 6 decorações em 2× |
| **ART-ENEMIES-UBER** | `src/gfx/art/enemiesUber.ts` | 9 sprites em 2× do bestiário (`motoboy*`, `drone*`, `patinete*`, `pichador*`, `lata`) |
| **CORE** | `src/game/game.ts`, `src/game/player.ts`, `src/game/level.ts`, `src/game/levels.ts` | Física de `level.autoscroll`, câmera autoscroll, `createLevelUber` (Fase 5) + `createLevel5` (Fase 6), vitória `'uber_goal'` |
| **LEVEL-UBER** | `src/game/levelUber.ts`, `scripts/check-level-uber.mjs`, `scripts/check-level6.mjs` | Mapa 240×14 da Marginal + validadores de alcançabilidade |
| **ENEMY-UBER** | `src/game/enemiesUber.ts` | 4 inimigos de 1 golpe (`motoboy`, `drone`, `patinete`, `pichador` + `lata`) |
| **OBJECTS-UBER** | `src/game/objectsUber.ts` | `createUberCar`, `createCoolerUber`, `createUberGoal` |
| **BG-UBER** | `src/gfx/backgroundUber.ts` | Parallax noturno de alta velocidade da Marginal Tietê / Ponte Estaiada / Minhocão |
| **AUDIO** | `src/audio/audio.ts` | Faixa `'uber'` estilo *Mega Man / Mega Man X* (150 BPM, rock chiptune com baixo em galope e twin leads) + SFX `'rev'` e `'horn'` |
| **HUD-DOCS** | `src/game/hud.ts`, `README.md`, `AGENTS.md` | Cartão de intro `'uber'`, `drawWin` para Fase 5 (Uber) e Fase 6 (Transportadora), docs atualizados |

## 7. Critérios de Aceite

- `npm run typecheck` e `npm run build` sem erros.
- `node scripts/check-art.mjs` → `"arte OK"`, sem sprites ausentes nem erros, e `uber_car` claramente preto, escrito `UBER` em branco e com o motorista visível na janela.
- `node scripts/check-level.mjs`, `check-level2.mjs`, `check-level3.mjs`, `check-level4.mjs`, `check-level-uber.mjs`, `check-level5.mjs`, `check-level6.mjs` e `check-bonus.mjs` todos passando.
- Todos os inimigos da Fase 5 morrem com apenas 1 golpe; trilha sonora inspirada em Mega Man tocando na Fase 5; Fase 5 precede a Fase 6 (Transportadora); Pull Request aberto para `main`.
