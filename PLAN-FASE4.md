# PLAN-FASE4.md — Fase 4 "Favela do Rio" (Do Morro ao Tribunal)

Leia também: `level-4-refs/gdd_fase4_rio_world.md`, `level-4-refs/gdd_bestiario_e_amaro.md`, `level-4-refs/plano_execucao_fase4.md`, a foto de referência `level-4-refs/amaro.jpg`, e `PLAN.md` / `PLAN-FASE2.md` / `PLAN-FASE3.md`.

Os CONTRATOS já estão escritos pelo orquestrador e o projeto compila com stubs: `src/core/types.ts`, `src/gfx/spec.ts` (seção FASE 4), `src/gfx/atlas.ts`, `scripts/check-art.mjs`, cabeçalho/legenda em `src/game/level4.ts`. `?fase=4` na URL começa direto na Fase 4.

## 1. Narrativa e fluxo
- Fim da Fase 3 (`Bahia World`) → tela de conclusão passa a oferecer `"ENTER OU TOQUE PARA A FASE 4"` (antes era "jogar novamente").
- Cartão de intro: `"FASE 4"` + `FAVELA DO RIO` e subtítulo `"DO MORRO AO TRIBUNAL"`.
- Fase terrestre (`level.underwater === false`), mesmo envelope de pulo das Fases 1 e 2 (`PHYS` em `constants.ts`: altura máx ≈ 3 tiles, alcance ≈ 4 tiles).
- No final da fase (Ato 4, pátio do Tribunal diante da fachada `tribunal_facade` e ao lado do balde `mop_bucket`), **Amaro** (o faxineiro do tribunal, usando uniforme azul-petróleo e vassoura de piaçava) varre o chão (`amaro_sweep`) em silêncio (personagem silencioso, sem caixa de diálogo).
- Ao tocar no Amaro (`onTouchPlayer` → `world.win()`):
  - `game.win()` identifica o objetivo (`e.kind === 'amaro'`), posiciona o Pardo com `this.player.startDrink(cx + side * GOAL_STAND_OFF, 'mineral', side === -1 ? 1 : -1)` e toca `'win'`.
  - Na cena `'winning'`, Amaro toca `'deliver'` uma vez, exibe `amaro_give` e estende a `mineral_bottle` até o Pardo entrar em `drinkStage === 'sip'`/`'done'`, quando o Pardo bebe (`pardo_drink_mineral`) e solta partículas `sparkle` / `splash`.
- Tela `"FASE 4 CONCLUÍDA!"`: exibe `pardo_drink_mineral`, `mineral_bottle`, `amaro_cheer` (espelhado), contadores (pontos, moedas, bônus de tempo), a frase **"PARDO SE HIDRATOU COM A ÁGUA DO AMARO"** e `"ENTER OU TOQUE PARA JOGAR NOVAMENTE"` (volta à Fase 1 do zero).

## 2. Inimigos (ENEMY, `src/game/enemies4.ts`)
`createRioEnemy(kind, centerX, footY)` — para `pombo`, `footY` = centro Y da âncora (como o tucano na Fase 2); para os demais terrestres (`caramelo`, `gato`, `capivara`, `traficante`), `footY` = base dos pés no chão. Derrotado por soco: voa girando/de ponta-cabeça para fora da tela com gravidade.

| Inimigo | Hitbox · pts | IA | Soco |
|---|---|---|---|
| `caramelo` | 18x12 · 300 | Patrulha horizontal (~38px/s) virando em bordas/paredes. Pardo a ≤5 tiles à frente e ±1.2 tile em Y: para 0.25s (`caramelo_bark`, sfx `'bark'`), dá bote rasante em arco (vx=135*dir, vy=-145), pousa e descansa 0.5s. | 1 soco. |
| `pombo` | 18x10 · 400 | Territorial nas linhas 3..6 (acorda a ≤7 tiles em X, leash de 10 tiles da âncora). Voa em senoide (~48px/s, amp ±10px) se aproximando do Pardo; a cada ~2.1s, se Pardo abaixo e ≤3.5 tiles em X, mostra `pombo_dive` por 0.25s, toca `'squawk'` e solta `dropping` (6x6, cai com gravidade 520, dano ao toque, some no chão com `splash`). | 1 soco aéreo. O projétil `dropping` pode ser socado (+10 pts). |
| `gato` | 16x12 · 400 | Patrulha curta (±1.5 tile a ~22px/s) virando em bordas/paredes. Ciclo: normal 1.7s (`gato`, vira para o Pardo) → curto-circuito 0.95s (`gato_shock`, sfx `'zap'` ao iniciar se perto, solta `sparkle`). | 1 soco **só quando normal**. Em `gato_shock` o soco **rebate** (retorna `false`, sfx `'hit'`). |
| `capivara` | 24x14 · 600 | Patrulha em superfície larga (~30px/s). Pardo a ≤6.5 tiles à frente e ±1 tile em Y: telegrafa 0.35s (`capivara_charge`, sfx `'roar'`), dá dash horizontal (~155px/s por 0.55s, parando em bordas/paredes), descansa 0.7s. | **2 socos**: 1º soco → knockback curto + **stun 1.2s** (parada, piscando, `stun_stars` girando acima, sfx `'stun'`, inofensiva ao toque); 2º soco no stun → derrota. |
| `traficante` | 12x20 · 500 | Vigia lajes/pisos (patrulha curtíssima ±1 tile a ~18px/s, vira para o Pardo). Quando o Pardo está a ≤9 tiles em X e ±3 tiles em Y, executa ciclo justo: **cooldown 1.85s** (`traficante`, guarda baixa) → **mira telegrafada 0.55s** (`traficante_aim` frame 0, parado) → **disparo 0.20s** (`traficante_aim` frame 1, sfx `'shoot'`, lança 1 `bullet` a `footY - 14`). O projétil `bullet` (6x4) viaja na horizontal a `140px/s`, causa **1 coração/gota de dano** (`world.player.hurt(world, cx, 1)`), **NÃO pode ser destruído por soco** (sem `onPunch`) e some ao atingir o Pardo, parede sólida ou percorrer 180px. | 1 soco no traficante (pule a bala e avance na janela de 1.85s). |

## 3. Objetos e NPC (OBJECTS, `src/game/objects4.ts`)
- `createClayFilter(x, y)`: filtro de barro `clay_filter` (16x32), solta até 3 gotas (`createDrop`) ao ser socado (`onPunch`), com `fx('splash')`, depois muda para frame 1 (vazio).
- `createAmaroGoal(centerX, footY)`: entidade `kind: 'amaro'`, hitbox 16x22 centrada em `centerX` com base em `footY`. Personagem silencioso (sem `world.say` nem `'talk'`). Na cena `'playing'`, varre um trecho curto (`±6px` a `10px/s`) desenhando `amaro_sweep` (4 frames) com `flipX = true` e soltando `fx('dust')` leve; na cena `'winning'`/`'win'` desenha `amaro_give` + `mineral_bottle` até o Pardo beber (`drinkStage === 'sip' || 'done'`), quando passa a `amaro_cheer` e solta `fx('sparkle')` enquanto o Pardo bebe.

## 4. Donos dos arquivos e Alocação de Modelos (Famílias Argon, Carbon, Hydrogen)
| Módulo | Arquivos | Família | Modelo |
|---|---|---|---|
| ORQUESTRADOR | Contratos (`types.ts`, `spec.ts`, `atlas.ts`, `check-art.mjs`) + QA | Argon | `gemini-4-argon-high` |
| ART-AMARO | `src/gfx/art/amaro.ts` | Argon | `gemini-4-argon-high` |
| CORE | `src/game/game.ts`, `src/game/player.ts`, `src/game/level.ts`, `src/game/levels.ts` | Argon | `gemini-4-argon-high` |
| LEVEL | `src/game/level4.ts`, `scripts/check-level4.mjs` | Hydrogen | `gemini-4-hydrogen-xhigh` |
| AUDIO | `src/audio/audio.ts` | Hydrogen | `gemini-4-hydrogen-high` |
| ENEMY | `src/game/enemies4.ts` | Carbon | `gemini-4-carbon-high` |
| ART-ENEMIES | `src/gfx/art/enemies4.ts` | Carbon | `gemini-4-carbon-high` |
| ART-WORLD | `src/gfx/art/rio.ts` | Carbon | `gemini-4-carbon-medium` |
| BG | `src/gfx/background4.ts` | Carbon | `gemini-4-carbon-medium` |
| OBJECTS | `src/game/objects4.ts` | Hydrogen | `gemini-4-hydrogen-medium` |
| HUD | `src/game/hud.ts` | Hydrogen | `gemini-4-hydrogen-medium` |
| DOCS | `lore.md`, `README.md`, `PLAN.md` | Hydrogen | `gemini-4-hydrogen-low` |
