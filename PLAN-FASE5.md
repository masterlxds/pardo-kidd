# PLAN-FASE5.md — Fase 5 "Transportadora de São Paulo" (Hora do Café)

Leia também: `level-5-refs/gdd_fase5_transportadora.md` (GDD), `level-5-refs/gdd_bestiario_e_maia.md` (inimigos e Maia), a foto `level-5-refs/maia.jpg`, o sprite conceitual `level-5-refs/maia_conceito.png` (+ `.txt` com a grade e `.mjs` gerador) e `PLAN.md` / `PLAN-FASE2.md` / `PLAN-FASE3.md` / `PLAN-FASE4.md` (arquitetura e regras que continuam valendo).

**Status: plano aprovado por inteiro (incluindo o `arremessador`); em implementação.**

## 0. Etapas

1. **Etapa 0 (feita):** GDD, bestiário, sprite conceitual do Maia, este plano → aprovação do João.
2. **Etapa 1 — ORQUESTRADOR escreve os contratos** (sozinho, antes de paralelizar) até `npm run typecheck` passar com stubs.
3. **Etapa 2 — 11 subagentes em paralelo**, cada um dono exclusivo dos seus arquivos (§6).
4. **Etapa 3 — ORQUESTRADOR faz QA:** `npm run build`, `check-art`, `check-level*.mjs` (1–5), inspeção dos PNGs de preview, jogar `?fase=5` e a transição Fase 4 → 5.

## 1. Contratos (Etapa 1, ORQUESTRADOR)

- `src/core/types.ts`: `LevelTheme` += `'sampa'`; `SfxName` += `'squeak' | 'crate' | 'sip' | 'beep' | 'throw'`; `EnemyKind` += `'rato' | 'carregador' | 'empilhadeira' | 'arremessador'`.
- `src/gfx/spec.ts`, seção `FASE 5 — TRANSPORTADORA DE SÃO PAULO`:
  - Maia (`art/maia.ts`): `maia_idle [34,36,2]`, `maia_give [34,36,2]`, `maia_cheer [34,36,2]`, `maia_face [16,16,1]`, `coffee_cup [12,12,2]`, `pardo_drink_coffee [20,24,2]`.
  - Inimigos (`art/enemies5.ts`): `rato [16,10,2]`, `carregador [22,28,2]`, `carregador_bravo [22,24,2]`, `empilhadeira [32,28,2]`, `empilhadeira_dash [32,28,1]`, `arremessador [20,24,2]`, `arremessador_throw [22,26,2]`, `pacote [8,8,2]`.
  - Mundo (`art/sampa.ts`): tiles `tile_sp_top [16,16,2]`, `tile_sp_ground [16,16,2]`, `tile_sp_rock [16,16,3]` (baú branco/azul/laranja), `tile_sp_spike`, `tile_sp_block`, `tile_sp_block_item`, `tile_sp_oneway` (todos `[16,16,1]`); objetos `bebedouro [16,32,2]`, `platform_dock [32,10,1]`, `platform_crates [32,10,2]`; decoração `truck_cab [40,48,1]`, `truck_wheels [48,16,1]`, `cone [8,12,1]`, `dock_sign [16,16,1]`, `forklift_sign [16,16,1]`, `hand_truck [16,24,1]`, `oil_drum [16,20,1]`, `guarita [48,48,1]`, `time_clock [16,24,1]`, `coffee_machine [24,32,1]`.
- `src/gfx/palette.ts`: nenhuma cor nova prevista (listras do SPFC = `r R w W M K k`; papelão = `n N o O P`). Se algum agente de arte precisar, pede ao ORQUESTRADOR — não edita a paleta.
- `src/gfx/atlas.ts` e `scripts/check-art.mjs`: importar e espalhar `MAIA`, `ENEMIES5`, `SAMPA`.
- Stubs compiláveis: `art/maia.ts`, `art/enemies5.ts`, `art/sampa.ts`, `background5.ts`, `enemies5.ts`, `objects5.ts`, e `level5.ts` com cabeçalho + **legenda (contrato)**:
  - Tiles: `. = # R B ? W - ^` (GDD §3). Marcadores: `P` spawn, `K` checkpoint, `c` moeda, `r` rato, `g` carregador, `e` empilhadeira, `a` arremessador, `V` bebedouro, `m`/`M` movers H/V (`LEVEL5_MOVERS`), `d` pilha de caixas bamba, `A` Maia. Decoração: `t` cabine de caminhão, `w` rodas, `n` cone, `s` placa de doca, `f` placa de empilhadeira, `h` carrinho de mão, `o` tambor, `G` guarita, `q` relógio de ponto, `C` máquina de café.

## 2. Narrativa e fluxo (CORE + HUD)

- Fim da Fase 4 → `ENTER OU TOQUE PARA A FASE 5` (antes: jogar novamente).
- Intro: `FASE 5` + `TRANSPORTADORA DE SÃO PAULO` + `HORA DO CAFÉ`.
- Objetivo `kind === 'maia'`: `game.win()` posiciona o Pardo com `startDrink(cx + side * GOAL_STAND_OFF, 'coffee', …)` (novo `DrinkItem`), toca `win`; Pardo usa `pardo_drink_coffee` e toca `sip` ao começar a beber.
- Tela `FASE 5 CONCLUÍDA!` (`idx === 4`): `pardo_drink_coffee`, `coffee_cup`, `maia_cheer` espelhado, contadores e **"O PARDO TOMOU O CAFÉ NA TRANSPORTADORA"** + `ENTER OU TOQUE PARA JOGAR NOVAMENTE`. O Maia tem 36 px de altura: conferir que cabe no layout da tela (os outros NPCs têm 26).
- `?fase=5` funciona sem mudança em `main.ts` se o parse já usa `LEVEL_COUNT` (CORE confere).

## 3. Inimigos (ENEMY) — resumo; detalhes no bestiário

| Inimigo | Hitbox · pts | IA | Soco |
|---|---|---|---|
| `rato` | 12×8 · 100 | Corre ~55 px/s, vira em bordas/paredes. | 1 |
| `carregador` | 14×24 → 12×20 · 500 | Vai e vem ±4 tiles a ~32 px/s sem ver o Pardo. Após perder a caixa: persegue a ~70 px/s no mesmo trecho. | 2 (1º quebra a caixa: `crate`, `debris`, +1 moeda) |
| `empilhadeira` | 28×24 · — | Patrulha ~28 px/s; telegrafa 0,4 s (`beep`), dash ~150 px/s por 0,6 s, descansa 0,8 s. | Rebate (indestrutível) |
| `arremessador` | 12×20 · 400 | Parado no alto, virado para o Pardo. A ≤ 8 tiles: espera 1,6 s → aviso 0,45 s → arremessa `pacote` 8×8 em arco (vx ≈ 90, vy ≈ −200, g 520; `throw`). Pacote: 1 de dano, pode ser socado (+10). | 1 |

Todos causam 1 de dano ao toque.

## 4. Objetos e NPC (OBJECTS, `objects5.ts`)

- `createBebedouro(x, y)`: molde do `createClayFilter` (3 gotas, frame 1 = vazio).
- `createMaiaGoal(centerX, footY)`: ver bestiário §2. Silencioso; `maia_idle` → `maia_give` → `maia_cheer`.
- Movers e pilha bamba: reaproveitar as fábricas de `objects.ts`/`objects4.ts` com os sprites `platform_dock` / `platform_crates` (CORE liga na tabela de marcadores de `level.ts`).

## 5. Level (LEVEL) — ~240×14, 4 atos (GDD §4)

`scripts/check-level5.mjs` no molde do `check-level4.mjs`: dimensões, legenda, contagens mínimas, ancoragens, inimigos ≥ 5 tiles de `P`/`K`, corredor ≥ 8 tiles para `e` e ≥ 9 para `g`, `a` sempre ≥ 2 tiles acima do chão-base e nunca a < 12 tiles de um `e`, simulação de pulo provando `P` → `A`, todas as moedas e bebedouros alcançáveis.

## 6. Donos dos arquivos e modelos

Critério: **Fable** onde há visão multimodal + arte de identidade (rosto real) ou coordenação; **Opus** onde há lógica sensível a regressão, raciocínio espacial ou pixel art grande; **Sonnet** para trabalho bem especificado com molde pronto nas fases anteriores; **Haiku** para texto.

| Módulo | Arquivos (dono exclusivo) | Dificuldade | Família |
|---|---|---|---|
| ORQUESTRADOR | `core/types.ts`, `gfx/spec.ts`, `gfx/palette.ts`, `gfx/atlas.ts`, `scripts/check-art.mjs`, legenda de `level5.ts`, QA final | Alta — contratos e integração | **Fable** |
| ART-MAIA | `src/gfx/art/maia.ts` | Alta — retrato fiel à foto em 68×72, 3 poses × 2 frames, a partir de `maia_conceito.txt` | **Fable** |
| CORE | `game/game.ts`, `game/player.ts`, `game/level.ts`, `game/levels.ts` | Alta — `createLevel5`, marcadores, `'coffee'`, objetivo `'maia'`, BG por tema, sem regredir 1–4 | **Opus** |
| LEVEL | `game/level5.ts` (mapa), `scripts/check-level5.mjs` | Alta — mapa 240×14 + simulador de alcançabilidade | **Opus** |
| ART-WORLD | `src/gfx/art/sampa.ts` | Média-alta — 7 tiles, caminhão (cabine 80×96 px reais), 10 decorações | **Opus** |
| ART-ENEMIES | `src/gfx/art/enemies5.ts` | Média — 8 sprites, 15 frames | **Opus** |
| ENEMY | `src/game/enemies5.ts` | Média — 4 máquinas de estado + projétil, molde em `enemies4.ts` (traficante/pombo) | **Sonnet** |
| BG | `src/gfx/background5.ts` | Média — parallax procedural (skyline, galpões, garoa, interior no Ato 3) | **Sonnet** |
| AUDIO | `src/audio/audio.ts` | Média — faixa `sampa` + 5 sfx | **Sonnet** |
| OBJECTS | `src/game/objects5.ts` | Baixa — 2 fábricas com molde em `objects4.ts` | **Sonnet** |
| HUD | `src/game/hud.ts` | Baixa — intro `sampa`, `drawWin` idx 3 (texto) e idx 4 (tela nova) | **Sonnet** |
| DOCS | `README.md`, `lore.md` (§9), `PLAN.md`, `AGENTS.md` | Baixa | **Haiku** |

Dependências entre agentes na Etapa 2: nenhuma em arquivo (contratos cobrem tudo). ART-MAIA entrega também `pardo_drink_coffee` e `coffee_cup` (mesmo arquivo), como o `amaro.ts` fez.

## 7. Regras de arte (ART-*)

As do `PLAN-FASE3.md §8`: `SpriteArt` em 2×, contorno `k`, 2–3 tons, olhando para a DIREITA, base na última linha; validar com `node scripts/check-art.mjs art-preview-<nome>.png <prefixos>` e **abrir o PNG e iterar**. ART-MAIA parte da grade aprovada em `level-5-refs/maia_conceito.txt` (pose joia = `maia_idle[0]`, pose entrega = `maia_give[0]`) e refina à mão: rosto, mãos, dobras da camisa, segundo frame de cada pose e `maia_cheer`. Não descaracterizar: alto, largo, listras verticais tricolores, barba fina separada do cabelo, bermuda preta, descalço.

## 8. Critérios de aceite

- `npm run build` sem erros; `check-art` sem ausentes/erros; `check-level.mjs` … `check-level5.mjs` OK.
- Fases 1–4 intactas. Fase 4 → Fase 5 → entrega do café → tela final com a frase exata → jogar novamente, por teclado e toque.
- Rato (1 dano, 1 soco), carregador (1 dano, 2 socos), empilhadeira e arremessador como no bestiário; música própria com mute.

## 9. Regras para subagentes

Iguais ao `PLAN.md §8`: edite só seus arquivos; não altere contratos (faltou algo → faça o melhor dentro do contrato e relate); TypeScript estrito, `import type`; sem dependências nem assets externos; rode `npx tsc --noEmit` no fim e corrija só erros dos SEUS arquivos; relate em poucas linhas. Não faça commits. Não inicie servidor de desenvolvimento.

## 10. Decisões

Fechadas: carregador com 2 socos · empilhadeira incluída · `arremessador` como 4º inimigo · Maia silencioso · sprite conceitual do Maia aprovado.
