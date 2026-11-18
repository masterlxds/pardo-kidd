# PLAN-FASE2.md — Fase 2 "Coração da Amazônia"

Leia também `PLAN.md` (arquitetura e regras da Fase 1, que continuam valendo) e `lore.md`.

## 1. Narrativa e fluxo
- Ao vencer a Fase 1, a tela de vitória mostra "ENTER OU TOQUE PARA A FASE 2". Pontos, moedas e vidas continuam; hidratação volta ao máximo; `elapsed`/checkpoint zeram.
- Antes de cada fase: cena `intro` (~2.2s, pula com Enter/toque) com o cartão "FASE N" + nome (`level.name`).
- Fase 2: o Pardo (mesmo personagem) atravessa a floresta até a **oca indígena**, onde o **alien verde de chapéu** (camiseta amarela, calça azul — arte conceitual `arte-fase2` descrita abaixo) o espera com a **mamadeira do índio**. Ao tocar o alien: o alien estende a mamadeira (`alien_give`), o Pardo anda até ele e bebe (`pardo_drink_bottle`), som `deliver`.
- Tela de conclusão da Fase 2: título "FASE 2 CONCLUÍDA!", contadores, e a frase **"PARDO SE HIDRATOU MAMANDO O ÍNDIO"**. Depois: "ENTER OU TOQUE PARA JOGAR NOVAMENTE" (volta à Fase 1 do zero).
- Atalho de teste: `?fase=2` na URL começa direto na Fase 2.

Arte conceitual (resumo): pixel art 16-bit; céu azul claro com sol amarelo e raios; ao fundo mata densa com cachoeiras brancas caindo em penhascos de pedra; rio azul com troncos/canoas; cipós pendurados do topo; palmeiras e árvores grandes; chão de grama verde viva sobre terra vermelho-alaranjada com pedrinhas e raízes pendendo; blocos de pedra marrom rachada, alguns com estrela dourada; onça-pintada, jacaré verde, cobra rosa enrolada, tucano preto de bico laranja num galho; helicônias vermelhas e samambaias.

## 2. Level design (≈230×14, chão base na linha 11)
1. **Margem do Igarapé (0–55):** apresenta cobra, blocos-estrela, cipó-d'água, um degrau de terra como na arte. Seguro.
2. **Rio das Cachoeiras (55–135):** água mata. Troncos flutuantes (móveis H) sobre trechos largos, vitórias-régias que afundam, ilhotas de pedra, jacarés nas margens/ilhotas, tucanos por cima soltando frutos. Checkpoint no meio.
3. **Copa das Árvores (135–205):** subida por galhos one-way e plataforma vertical, onças em galhos largos/chão, parede de blocos para socar, segredo de moedas na copa. Checkpoint no início.
4. **Aldeia (205–fim):** chão plano, cerca de taquara, totem, oca, alien com a mamadeira.

Envelope de pulo igual à Fase 1 (degraus ≤2 tiles, vãos obrigatórios ≤3). Legenda do mapa: `src/game/level2.ts`.

## 3. Inimigos (hitbox aprox · pontos)
| Inimigo | IA | Derrota |
|---|---|---|
| `onca` (24x12 · 600) | Patrulha lenta (~30px/s) virando em bordas/paredes. Se o Pardo estiver a ≤7 tiles à frente e ±1 tile de altura: agacha 0.4s (`onca_crouch`), dá bote em arco (vx≈150, vy≈-220, `onca_pounce`), pousa, descansa 0.8s. `roar` ao iniciar o bote. | 2 socos: o 1º atordoa 1s (crouch piscando, empurrada), o 2º arremessa. Toque = dano. |
| `jacare` (32x10 · 400) | Parado (ou patrulha curtíssima ±1 tile) num chão/margem. Ciclo: fechado 1.6s → abre 0.9s (`chomp` ao fechar). Vira para o Pardo quando fechado. | Soco com a boca **fechada**. Com boca aberta o soco não conecta (rebate) e a boca causa dano. |
| `cobra` (12x12 · 300) | Enrolada, balançando. Pardo ≤3 tiles à frente e mesma altura: `hiss`, telegrafa 0.25s, bote (hitbox estende para 24 de largura por 0.3s, `cobra_strike`), recolhe 0.6s (vulnerável), cooldown 1s. Vira para o Pardo. | Soco durante recolhimento/cooldown (fora do bote). No bote o soco não conecta. |
| `tucano` (18x10 · 400) | Voo horizontal senoidal (amp ~10px) a ~45px/s em direção ao Pardo quando entra na tela; a cada ~2.2s, se Pardo abaixo e perto em x, solta um `fruit` (entidade, cai com gravidade, dano ao toque, some no chão com `splash`/`dust`). `squawk` ao soltar. | Soco aéreo. O fruto pode ser socado (some, +10). |

## 4. Donos dos arquivos (cada agente edita SÓ os seus)
| Módulo | Arquivos | Modelo |
|---|---|---|
| CORE | `src/game/game.ts`, `src/game/level.ts`, `src/game/levels.ts` (novo), `src/game/objects.ts`, `src/game/player.ts`, `src/main.ts`, `src/core/physics.ts` | Opus |
| ENEMY | `src/game/enemies.ts` | Sonnet |
| LEVEL | `src/game/level2.ts`, `scripts/check-level2.mjs` (novo) | Sonnet |
| BG | `src/gfx/background2.ts` | Sonnet |
| AUDIO | `src/audio/audio.ts` | Sonnet |
| ART-CHAR | `src/gfx/art/enemies2.ts` | Opus |
| ART-WORLD | `src/gfx/art/amazon.ts` | Sonnet |
| HUD | `src/game/hud.ts` | Haiku |
| DOCS | `lore.md`, `README.md`, `PLAN.md` | Haiku |

Contratos (só o orquestrador altera): `src/core/types.ts`, `src/core/constants.ts`, `src/gfx/spec.ts`, `src/gfx/palette.ts`, legenda em `src/game/level2.ts`, `src/gfx/atlas.ts`, `scripts/check-art.mjs`.

## 5. Interfaces entre módulos (combinadas)
- `hud.ts` exporta `drawIntro(ctx, world)` (cartão "FASE N" + `world.level.name`, usando `world.state.sceneTime` para animar). `drawWin` decide o texto por `world.level.index` (0 → "PRÓXIMA: FASE 2"; 1 → frase final + sprites `pardo_drink_bottle`, `bottle`, `alien`).
- CORE chama `drawIntro` na cena `intro` e `audio.startMusic(world.level.theme)`.
- CORE: `level.ts` vira construtor genérico; `levels.ts` exporta `LEVELS: (() => Level)[]` e `LEVEL_COUNT`. Nome da Fase 2: `'CORAÇÃO DA AMAZÔNIA'`.
- CORE: background por tema (`createBackground()` para 'sertao', `createAmazonBackground()` de `src/gfx/background2.ts` para 'amazonia').
- CORE em `objects.ts`: `createMovingPlatform(..., sprite = 'platform_rock')`, `createCrumblePlatform(x, y, sprite = 'platform_crumble')`, `createVineWater(x, y)` (como o cacto, sprite `vine_water` 16x32), `createAlienGoal(cx, footY)` (entidade `kind: 'goal'`, desenha `alien`/`alien_give` + `bottle` na mão; tocar → `world.win()`).
- ENEMY: `createEnemy(kind, centerX, footY)` com os 4 novos tipos; o fruto é entidade interna de `enemies.ts`.
- Sprites e tamanhos: `src/gfx/spec.ts` (seção FASE 2). Cores: `src/gfx/palette.ts` (inclui extensão Fase 2: F I J U X Z 1 2 3 4).

## 6. Critérios de aceite
- `npm run build` sem erros; `node scripts/check-art.mjs` sem ausentes; `node scripts/check-level.mjs` e `node scripts/check-level2.mjs` OK.
- Fase 1 → Fase 2 → tela "PARDO SE HIDRATOU MAMANDO O ÍNDIO" → jogar novamente, por teclado e toque.
- 4 inimigos com a IA acima; água mata; troncos e vitórias-régias funcionam; Fase 2 completável.
- Música própria da Fase 2 (carimbó chiptune original), com mute.

## 7. Regras para subagentes
Iguais ao `PLAN.md §8`: edite só seus arquivos; TypeScript estrito, `import type`; sem dependências nem assets externos; rode `npx tsc --noEmit` no fim (corrija só erros nos SEUS arquivos — outros agentes editam em paralelo) e relate em poucas linhas o que fez, decisões e pendências. Não faça commits.
