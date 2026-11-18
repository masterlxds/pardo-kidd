# PLAN-FASE3.md — Fase 3 "Bahia World" (subaquática)

Leia também: `level 3/gdd_pardo_kidd_in_the_bahia_world.md` (GDD, fonte da verdade de design), as duas imagens em `level 3/` (capa + 4 opções da Jandira), `PLAN.md` e `PLAN-FASE2.md` (arquitetura e regras que continuam valendo).

Os CONTRATOS já estão escritos pelo orquestrador e o projeto compila com stubs: `src/core/types.ts`, `src/core/constants.ts`, `src/gfx/spec.ts` (seção FASE 3), `src/gfx/palette.ts` (extensão Fase 3: `5 6 7 8 9 0 + @ & * ! %`), legenda em `src/game/level3.ts`, `createLevel3` em `src/game/level.ts`, `src/gfx/atlas.ts`, `scripts/check-art.mjs`. `?fase=3` na URL começa direto na Fase 3.

## 1. Narrativa e fluxo
- Fim da Fase 2 → tela de conclusão passa a oferecer "ENTER OU TOQUE PARA A FASE 3" (antes era "jogar novamente").
- Cartão de intro: "FASE 3" + `BAHIA WORLD` (o Pardo adormece e sonha com o fundo do mar da Baía de Todos-os-Santos).
- Fase 100% subaquática (`level.underwater === true`). Pardo de snorkel nada até o **Santuário**, onde **Jandira** (sereia baiana) guarda o **Cajado Jailnesco** num altar.
- Clímax (cutscene in-engine, cena `winning`): Pardo toca o cajado → `fanfare` → Pardo segura o cajado, abaixa a máscara e **lambe o cajado** (`pardo_lick`, ~3s, sfx `lick`) → cajado brilha dourado/turquesa (fx `sparkle`) → Jandira ri e acena (`jandira_laugh`) → tela "FASE 3 CONCLUÍDA!" com a frase **"PARDO LAMBEU O CAJADO JAILNESCO"**, fitinhas coletadas (n/3) e "ENTER OU TOQUE PARA JOGAR NOVAMENTE" (volta à Fase 1 do zero).
- A Jandira é uma personagem SILENCIOSA: não fala (as falas foram removidas a pedido). Ela só acena quando o Pardo chega perto, ri durante a lambida e mantém a aura de respiração.

## 2. Mecânicas
### 2.1 Nado (CORE, `player.ts`) — só quando `world.level.underwater`
- Estilo fases aquáticas de Super Mario World. Referência em `constants.ts → SWIM` (CORE pode afinar a sensação, mantendo o envelope): gravidade reduzida, afunda devagar até ~45px/s; cada toque no pulo = braçada (vy ≈ -115px/s, sem precisar de chão, com pequeno cooldown ~0.15s; sfx `swim` + fx `bubble`); horizontal até ~80px/s com aceleração/desaceleração suaves (deslize).
- Teto do nado em y=`SWIM_CEILING`=48 (linha d'água; as linhas 0-2 do mapa ficam acima da superfície). No chão anda devagar; pulo no chão = braçada.
- Soco igual ao das outras fases (mesma `punchBox`), pode socar nadando; soco mantém a inércia.
- Dano: knockback amortecido pela água. Morte por inimigo/ouriço/afogamento: Pardo vira e afunda devagar (sprite `pardo_swim_dead`), sem o salto de morte.
- Sprites: `pardo_swim_idle` (afundando/parado), `pardo_swim` (braçada/subindo/andando), `pardo_swim_punch`, `pardo_swim_hurt`, `pardo_swim_dead`. Estados novos `'swim'`/`'float'` em `PlayerState`.
- Bolhinhas (`fx 'bubble'`) saindo do snorkel de tempos em tempos.

### 2.2 Oxigênio (CORE drena em `game.ts`; HUD mostra)
- `state.air` (float 0..`maxAir`=5). Drena `dt / AIR_BUBBLE_TIME` por segundo só na cena `playing` em fase subaquática (30s no total). Volta a cheio ao carregar a fase/respawn.
- `air ≤ 1`: contagem regressiva `n = ceil(air * AIR_COUNTDOWN)` (5→1); CORE toca `countdown` a cada mudança de `n`. `air ≤ 0` → `player.kill` com sfx `drown` (perde vida).
- `player.refillAir(world)` restaura 100% (silencioso). Fissuras de bolhas e a aura da Jandira chamam isso.
- Fases 1 e 2 não mudam em nada (sem oxigênio na HUD, sem drenagem).

### 2.3 Fitinhas do Bonfim
- 3 colecionáveis secretos (`createRibbon`): tocar → `world.addRibbon()`, +1000 pts, sfx `ribbon`, fx `sparkle`. CORE zera `state.ribbons` e calcula `state.ribbonsTotal` (nº de entidades `kind === 'ribbon'`) a cada (re)montagem das entidades.

## 3. Level design (LEVEL) — ~240×18, areia base na linha 15
Legenda completa e regras de ancoragem: cabeçalho de `src/game/level3.ts` (contrato — não alterar a legenda).
1. **Barra (0–55):** água aberta sobre areia, placa, 1ª fissura de bolhas logo no começo (ensina o oxigênio), águas-vivas isoladas, 1 baiacu-bomba, 1º grupo de peixes-agulha, moedas em arcos que ensinam a braçada. Seguro.
2. **Recife de Corais (56–120):** plataformas de coral (`-`), corredores estreitos verticais com águas-vivas, siris em plataformas, baiacus-dentões patrulhando, ouriços no chão/teto, tartaruga em área aberta. **Fitinha 1** num nicho de coral indicado por peixes-dourados. Checkpoint.
3. **Ruínas Submersas (121–195):** tetos e paredes de rocha formando corredores (labirinto leve com caminho principal óbvio), colunas e arcos, moreias em fendas nas paredes, parede de blocos `B` para socar, tartarugas, dentões. **Fitinha 2** atrás de blocos; **Fitinha 3** numa câmara alta/secreta. Checkpoint no início.
4. **Santuário de Jandira (196–239):** calmo, sem inimigos, corais e pedras com fitinhas, altar `S` e Jandira `J` 3–4 tiles à direita dele. Parede de rocha fechando o fim.
- Fissuras `v`: distância máxima entre fissuras consecutivas (e do spawn à 1ª, e da última ao `S`) ≤ 40 tiles pelo caminho principal; sempre uma logo após cada checkpoint.
- ≥ 50 moedas. Mínimos: 6 `a`, 6 `g`, 3 `b`, 4 `D`, 4 `s`, 3 `T`, 3 `e`, 6 `v`, 3 `f` (exatos), 3 `p`, 2 `K`.
- `scripts/check-level3.mjs` (novo, no molde de `check-level2.mjs`): dimensões, legenda, contagens, ancoragens descritas na legenda, inimigos ≥5 tiles de spawn/checkpoints, **alcançabilidade por flood-fill de nado** (célula passável = ela e a de cima não-sólidas; `B/?/W` contam como passáveis; `^` não) do `P` até `S`, todas as moedas, fitinhas e fissuras, e o espaçamento das fissuras.

## 4. Inimigos (ENEMY, `src/game/enemies3.ts`)
`createSeaEnemy(kind, centerX, y)` — para `siri`, y = base; para os demais, y = centro. Sem gravidade (exceto siri, que anda no chão). Derrotado: vira de ponta-cabeça (desenhe com `ctx.scale(1,-1)`) e afunda para fora da tela. Toque = dano (`world.player.hurt`), salvo indicado.

**Blindados (2 socos):** 1º soco → knockback curto + **stun 1.5s** (parado, piscando, `stun_stars` girando acima, sfx `stun`, inofensivo ao toque); 2º soco durante o stun → derrota. Se o stun acabar, recupera a guarda (precisa de 2 de novo).

| Inimigo | Hitbox · pts | IA | Soco |
|---|---|---|---|
| `agua_viva` | 12x16 · 200 | Oscila na vertical em senoide (±24px, período ~3s) em torno da âncora. Toque = dano + sfx `zap`. | 1 soco. |
| `peixe_agulha` | 20x6 · 200 | Parado até o Pardo chegar a ~11 tiles em x e ±3 tiles em y; pisca 0.5s (aviso) e dispara na horizontal (~170px/s) na direção do Pardo; morre ao sair bem da tela ou bater em tile sólido. | 1 soco (timing). |
| `baiacu` | 12x10 murcho / 18x18 inflado · 300 | Quase parado (deriva ±4px). Ciclo: murcho 2s (`baiacu`) → inflado 2s (`baiacu_puff`). Inflado: toque = dano e o soco **rebate** (não conecta). Murcho: toque = dano leve normal. | 1 soco, só murcho. |
| `dentao` | 20x14 · 600 | Patrulha horizontal ±3 tiles (~35px/s), vira em paredes. Pardo na mesma linha (±12px) e ≤6 tiles à frente: abre a boca 0.35s (`dentao_dash`, telegrafa) e dá dash (~190px/s por ~0.6s), depois descansa 0.8s. | **2 socos** (stun). |
| `siri` | 20x12 · 500 | Anda de lado no chão/plataforma (~25px/s) virando em bordas/paredes; a cada ~2.5s para e fica 1.2s em guarda (`siri_guard`): soco **pela frente** é bloqueado (retorna false, sfx `hit`); pelas costas conecta. Fora da guarda é vulnerável. | **2 socos** (stun). |
| `tartaruga` | 28x14 · 700 | Nada em diagonal lenta (vx ±22, vy ±12), quicando em tiles sólidos e nos limites ±3 tiles (v) / ±6 tiles (h) da âncora. Toque **empurra** o Pardo (soma à posição/velocidade dele na direção dela) **sem dano**. Stun: `tartaruga_shell` girando. | **2 socos** (stun); o 2º a arremessa longe. |
| `moreia` | toca 16x16; esticada 28x10 · 600 | Escondida na toca (`moreia_hole`, inofensiva, soco não conecta). Descobre de que lado está a parede sólida (esq./dir.) e ataca para o lado livre. Pardo a ≤3.5 tiles desse lado e ±1.5 tile em y: estica em 0.15s (`moreia` recortada por `ctx.clip`), morde (frame 1) e fica exposta 1s, recolhe em 0.4s, cooldown 1s. Esticada: toque = dano. | **2 socos** (stun balançando fora da toca); só esticada. Derrotada: recolhe de vez (a toca fica). |

## 5. Objetos e NPCs (OBJECTS, `src/game/objects3.ts`)
- `createAirVent(cx, footY)`: desenha `air_vent`; solta bolhinhas (`fx 'bubble'`) e, a cada ~2.2s, uma **bolha grande** (entidade interna, sprite `air_bubble`, sobe ~28px/s com leve zigue-zague, some após ~6 tiles ou ao bater em tile sólido). Pardo toca a bolha grande → `player.refillAir`, sfx `air`, estoura (fx `bubble`), popup opcional. A própria fissura NÃO restaura.
- `createRibbon(cx, cy)`: flutua (bob), ver §2.3.
- `createGoldfishSchool(cx, cy)`: 4–6 `peixe_dourado` nadando em pequenos círculos/vai-e-vem em torno do ponto; neutro (sem `onTouchPlayer`/`onPunch`); dispersam um pouco quando o Pardo chega perto.
- `createStaffGoal(cx, footY)`: `altar` (32x16) com o `cajado` (8x28) em pé em cima, brilho pulsante. Hitbox ≈ cajado. Tocar → `world.win()` (como `createAlienGoal` em `objects.ts`). Na cena `winning`, quando o Pardo passa a lamber (`drinkStage` `'sip'`/`'done'`), **não desenha mais o cajado** (ele está no sprite `pardo_lick`) e solta `fx 'sparkle'` contínuo em volta do Pardo; toca `lick` ao começar a lambida.
- `createJandira(cx, footY)`: sprite 40x48 desenhado com `flipX = true` (olha para a ESQUERDA, de onde vem o Pardo). Estados: `jandira` (idle) → `jandira_wave` quando o Pardo está perto → `jandira_laugh` durante `winning`/`win`. Dispara as 3 falas da §1 (cada uma 1 vez; sfx `talk`). **Aura de respiração:** Pardo a ≤ 12 tiles → `player.refillAir` a cada passo. Sem `onPunch`, sem dano.

## 6. Interfaces entre módulos
- CORE `game.win()`: objetivo `kind === 'staff'` → `player.startDrink(alvoX, 'staff', 1)` com alvoX tal que o cajado do sprite `pardo_lick` (colunas ~17–23 do quadro de 24, quadro desenhado com o corpo 20x24 alinhado como sempre) caia sobre o centro do altar; toca `fanfare` em vez de `win`. Em fase subaquática a fase `'walk'` do drink faz o Pardo deslizar/afundar até pousar no chão em alvoX (com timeout de segurança), depois `'sip'` (~3.2s para `'staff'`).
- CORE `game.ts`: chama `background.drawForeground?.(ctx, camX, camY, time)` depois de mundo/entidades/partículas e antes da HUD; avança/expira `state.dialogue`; limpa `dialogue` em respawn/troca de fase; partículas `bubble` (sobem, vy negativa, leve oscilação) e `sparkle`.
- CORE `level.ts`: sombra de abismo usa a linha do chão da fase (hoje fixa em 11) — parametrizar em `LevelDef` (Fase 3 = 15).
- HUD: em `level.underwater` mostra **corações** (`icon_heart`) no lugar das gotas para `hydration`, **bolhas** (`icon_bubble`, `ceil(air)` cheias; última bolha piscando), moedas, e **fitinhas** `icon_ribbon n/total`. Contagem regressiva: número grande acima da cabeça do Pardo (coordenadas de tela via `world.camera`) + pulso vermelho/escuro sutil nas bordas da tela. Caixa de diálogo `state.dialogue` (parte de baixo da tela, retrato `jandira_face`, nome, texto com efeito de digitação, quebra de linha automática) nas cenas `playing`/`winning`. `drawWin`: índice 1 → mantém a frase da Fase 2 e passa a mostrar "ENTER OU TOQUE PARA A FASE 3"; índice 2 → tela final da Fase 3 (§1) com `pardo_lick`, `jandira_laugh`.
- AUDIO: faixa `bahia` (axé/ijexá chiptune ORIGINAL com timbre de berimbau e percussão de agogô/atabaque; clima aquático; loop) + sfx novos de `SfxName` (comentados em `types.ts`).
- BG: `createBahiaBackground()` com `draw` (camadas 1–2 do GDD §5.2 + cardumes + partículas) e `drawForeground` (camada 4).

## 7. Donos dos arquivos (cada agente edita SÓ os seus)
| Módulo | Arquivos | Modelo |
|---|---|---|
| CORE | `src/game/game.ts`, `src/game/player.ts`, `src/game/level.ts`, `src/game/levels.ts`, `src/core/physics.ts`, `src/main.ts` | Opus |
| ENEMY | `src/game/enemies3.ts` | Opus |
| OBJECTS | `src/game/objects3.ts` | Sonnet |
| LEVEL | `src/game/level3.ts` (só o mapa), `scripts/check-level3.mjs` | Sonnet |
| BG | `src/gfx/background3.ts` | Sonnet |
| AUDIO | `src/audio/audio.ts` | Sonnet |
| HUD | `src/game/hud.ts`, `src/gfx/font.ts` (só se faltar glifo) | Sonnet |
| ART-JANDIRA | `src/gfx/art/jandira.ts` | Fable |
| ART-PARDO | `src/gfx/art/pardoSwim.ts` | Opus |
| ART-SEA | `src/gfx/art/sea.ts` | Opus |
| ART-WORLD | `src/gfx/art/bahia.ts` | Sonnet |
| DOCS | `README.md`, `lore.md`, `PLAN.md` | Haiku |

## 8. Regras de arte (ART-*)
- Formato: `SpriteArt` (ver `src/gfx/artTypes.ts` e exemplos em `src/gfx/art/enemies2.ts`, `pardo.ts`). Cada frame = `altura×2` strings de `largura×2` caracteres (alta resolução 2×), cada caractere uma chave de `PALETTE` (`.` = transparente). Tamanhos e nº de frames: `spec.ts`.
- Estilo: pixel art 16-bit, contorno escuro `k` bem definido, sombreamento em 2–3 tons, paleta vibrante. Sprites olham para a DIREITA; base/pés na última linha.
- Validar: `node scripts/check-art.mjs <saida.png> <prefixos>` (gera PNG de pré-visualização — **abra o PNG com Read e itere até ficar bom**; use `S=8` para ver detalhes). Grave os PNGs fora do repositório ou com nome `art-preview*.png` (ignorado pelo git).
- O arquivo pode montar frames com pequenas funções auxiliares locais (sem imports além do tipo), desde que o resultado exportado obedeça ao formato.

## 9. Critérios de aceite
- `npm run build` sem erros; `node scripts/check-art.mjs` sem ausentes/erros; `check-level.mjs`, `check-level2.mjs`, `check-level3.mjs` OK.
- Fases 1 e 2 intactas. Fase 2 → Fase 3 → cutscene da lambida → tela final → jogar novamente, por teclado e toque.
- Nado, oxigênio com contagem e afogamento, fissuras, 7 inimigos com a IA acima (stun nos 4 blindados), 3 fitinhas, Jandira com falas e aura, música própria com mute.

## 10. Regras para subagentes
Iguais ao `PLAN.md §8`: edite só seus arquivos; não altere contratos (se faltar algo, faça o melhor dentro do contrato e relate); TypeScript estrito, `import type`; sem dependências nem assets externos; rode `npx tsc --noEmit` no fim (corrija só erros nos SEUS arquivos — outros agentes editam em paralelo) e relate em poucas linhas o que fez, decisões e pendências. Não faça commits. Não inicie servidor de desenvolvimento.
