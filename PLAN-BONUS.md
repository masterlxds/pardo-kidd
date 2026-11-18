# PLAN-BONUS.md — Fase Bônus "Tubo do Bonfim" (Special Stage Pseudo-3D)

Leia também: [`bonus-refs/gdd_fase_bonus_tubo.md`](bonus-refs/gdd_fase_bonus_tubo.md) (GDD, fonte da verdade de design), [`bonus-refs/plano_execucao_bonus.md`](bonus-refs/plano_execucao_bonus.md) (orquestração e interfaces), `PLAN.md`, `PLAN-FASE3.md` e `PLAN-FASE6.md` (arquitetura e regras que continuam valendo).

**Status: plano e GDD aprovados para execução autônoma pela próxima sessão/orquestrador.**

## 0. Etapas de Execução

1. **Etapa 0 (concluída):** GDD completo e plano de execução em `bonus-refs/` + este `PLAN-BONUS.md`.
2. **Etapa 1 — ORQUESTRADOR escreve os contratos e stubs** (sozinho, antes de paralelizar) até `npm run typecheck` passar com stubs compiláveis.
3. **Etapa 2 — 6 subagentes em paralelo**, cada um dono exclusivo dos seus arquivos (§5).
4. **Etapa 3 — ORQUESTRADOR faz QA completo:** `npm run typecheck`, `node scripts/check-art.mjs` (+ inspeção visual do PNG), `node scripts/check-bonus.mjs`, `node scripts/check-level.mjs` … `check-level6.mjs`, `npm run build`, e verificação de ponta a ponta (`?fase=bonus` e transição Fase 3 com 3/3 fitinhas → Bônus → Fase 4).

## 1. Contratos (Etapa 1 — ORQUESTRADOR)

- **`src/core/types.ts`**:
  - `Scene` += `'bonus_intro' | 'bonus' | 'bonus_end'`.
  - `MusicTrack` = `LevelTheme | 'bonus'`.
  - `SfxName` += `'bomb' | 'emerald'`.
  - Interface `BonusState` (`active: boolean; coins: number; target: number; stage: 1 | 2 | 3; cleared: boolean; endedByCheckpoint: boolean`) e campo `bonus: BonusState` em `GameState`.
- **`src/gfx/spec.ts`**, seção `FASE BÔNUS — TUBO DO BONFIM (PSEUDO-3D)`:
  - Pardo de costas (`art/bonus.ts`): `pardo_bonus_run [20, 24, 4]`, `pardo_bonus_jump [20, 24, 2]`, `pardo_bonus_hurt [20, 24, 1]`.
  - Parceiro Caramelo-Tails (`art/bonus.ts`): `buddy_bonus_run [18, 22, 4]`, `buddy_bonus_jump [18, 22, 2]`.
  - Pista e recompensas (`art/bonus.ts`): `bonus_coin [12, 12, 4]`, `bonus_bomb [14, 14, 2]`, `bonus_emerald [16, 16, 2]`, `bonus_gate [16, 16, 2]`.
- **`src/gfx/palette.ts`**: nenhuma cor nova necessária (cores das fitinhas e do caramelo já existem na paleta: `8 9 & y Y B b r R ! w k K q Q o O p P`). Se o agente de arte precisar de algo, pede ao ORQUESTRADOR — não edita a paleta.
- **`src/gfx/atlas.ts` e `scripts/check-art.mjs`**: importar e registrar `BONUS_ART` de `src/gfx/art/bonus.ts`.
- **Stubs compiláveis**: `src/gfx/art/bonus.ts` (`BONUS_ART`) e `src/game/bonus.ts` (`BonusStage`, `createBonusStage`).

## 2. Narrativa, Fluxo e Desbloqueio (CORE + HUD)

- **Gatilho:** Ao vencer a **Fase 3 ("Bahia World", `levelIndex === 2`)** com **todas as 3 Fitinhas do Bonfim** (`state.ribbons >= state.ribbonsTotal && state.ribbonsTotal > 0`):
  - A tela `drawWin` da Fase 3 exibe `"3/3 FITINHAS! ENTER OU TOQUE PARA A FASE BÔNUS"` no lugar de `"ENTER OU TOQUE PARA A FASE 4"`.
  - Confirmar inicia `startBonus()` → cena `'bonus_intro'` (~2.2s, pulável após 0.25s) → `'bonus'`.
  - Se o jogador tiver `< 3` fitinhas, `drawWin` segue o fluxo padrão para a Fase 4 (`loadLevel(3)`).
- **Atalho de teste:** `?fase=bonus` ou `?bonus=1` na URL inicia o jogo na Fase Bônus após a tela de título; `drawTitle` indica `MODO TESTE: FASE BÔNUS`.
- **Retorno à campanha:** Ao confirmar em `'bonus_end'`, o jogo segue para a **Fase 4 ("Favela do Rio", `loadLevel(3)`)** preservando `score`, `coins` e `lives` (inclusive o `+1UP` ganho na Esmeralda ou por 100 moedas).
- **Pausa:** `P` ou `Esc` durante `'bonus'` entra em `'paused'` guardando a origem `'bonus'` (`pausedFrom`), retomando para `'bonus'` e música `'bonus'` ao despausar.
- **Glifos de fonte:** `src/gfx/font.ts` aceita apenas MAIÚSCULAS, dígitos, acentos PT-BR e pontuação básica (`! ? - + × / : . , ' " ( ) ♥`). Não usar `%`, `=` ou outros símbolos ausentes.

## 3. Mecânica Pseudo-3D em Meio-Tubo (`src/game/bonus.ts`)

- **Câmera e Projeção (`320×180`):**
  - Meio-tubo semicircular $\theta \in [-1.48, +1.48]\text{ rad}$ ($\theta = 0$ no fundo central) e profundidade normalizada $z \in [0.06, 1.0]$.
  - O ponto de fuga $(\text{vpX}, \text{vpY})$ desliza suavemente com `curveX` e `curveY` da pista, curvando os ~22 anéis do túnel (7 raias radiais com as cores das Fitinhas do Bonfim em padrão *checkerboard* acelerado sobre céu estrelado noturno).
  - Objetos ordenados por $z$ decrescente (*painter's algorithm*), com sombra projetada na parede em $h = 0$ e escala perspectiva contínua via `SpriteAtlas`.
- **Controles e Física:**
  - `left`/`right`: aceleram angularmente o Pardo pelas paredes do tubo; gravidade tangencial ($-g_\theta \sin\theta$) puxa suavemente de volta ao centro ao soltar.
  - `jump`/`punch`: salto radial ($h > 0$) para fora da parede em direção ao centro do tubo, permitindo pular bombas e pegar arcos altos.
- **Parceiro (Caramelo-Tails):**
  - Fica em profundidade $z_b \approx 0.085$ (logo atrás do Pardo, que corre à frente em $z_p \approx 0.145$; o desvio lateral e a diferença de altura na tela evitam que ele oculte o herói), lendo um histórico de `11` passos (`~0.18s`) de $(\theta, h)$ do Pardo.
  - Coleta moedas ao seu alcance somando em `bonus.coins`, `st.coins` e `score`, e **não** faz o Pardo perder moedas se encostar em bombas.
- **Bombas (`bonus_bomb`):**
  - Colisão com o Pardo (quando `invuln <= 0`): `invuln = 1.0s`, toca `'bomb'`, `shake(4, 0.25)`, perde `min(bonus.coins, 5)` moedas do contador do bônus (com animação de moedas espalhando). Nunca tira vida nem hidratação.
- **3 Trechos e Metas:**
  - Trecho 1 (15s) → Meta **20 moedas** · Trecho 2 (16s) → Meta **45 moedas** · Trecho 3 (17s) → Meta **70 moedas**.
  - Checkpoint atingido com `bonus.coins >= target`: `+1000` pts, `'checkpoint'`, avisa `"META ATINGIDA!"`, segue ao próximo trecho.
  - Checkpoint abaixo da meta: encerra o bônus (`endedByCheckpoint = true`) e vai para `'bonus_end'` mantendo tudo já ganho.
  - Meta 3 atingida + coleta da **Esmeralda do Bonfim** (`bonus_emerald`): `cleared = true`, `+5000` pts, `+1 vida` (`oneup`), `'emerald'`, vai para `'bonus_end'`.

## 4. Validador (`scripts/check-bonus.mjs`)

- Importa o roteiro/ondas de `src/game/bonus.ts` diretamente via Node (type stripping).
- Garante:
  1. Exatamente 3 trechos e metas crescentes (`20, 45, 70`).
  2. Cada trecho fornece pelo menos **135%** das moedas necessárias para bater a meta acumulada.
  3. Nenhuma onda de bombas fecha > 60% do arco sem janela de passagem ou altura de pulo (`h`).
  4. Simulação automática com um bot simples coletando moedas e desviando de bombas conclui os 3 trechos com sucesso (`cleared === true`).

## 5. Donos Exclusivos dos Arquivos (Etapa 2)

| Módulo | Arquivos | Responsabilidade |
|---|---|---|
| **ORQUESTRADOR** | `src/core/types.ts`, `src/gfx/spec.ts`, `src/gfx/palette.ts`, `src/gfx/atlas.ts`, `scripts/check-art.mjs`, QA final | Contratos, stubs compiláveis, validação integrada e build |
| **ART-BONUS** | `src/gfx/art/bonus.ts` | 9 sprites em 2× (`pardo_bonus_*`, `buddy_bonus_*`, `bonus_*`), preview + ajuste visual |
| **BONUS-ENGINE** | `src/game/bonus.ts`, `scripts/check-bonus.mjs` | Renderizador pseudo-3D meio-tubo, física Pardo + Caramelo-Tails, 3 trechos e validador |
| **CORE** | `src/game/game.ts`, `src/main.ts` | Cenas `bonus_intro`/`bonus`/`bonus_end`, transição da Fase 3 (3/3 fitinhas) e ida para Fase 4, `?fase=bonus` |
| **HUD** | `src/game/hud.ts` | `drawBonusIntro`, `drawBonusHud`, `drawBonusEnd`, ajuste em `drawTitle` e `drawWin` (Fase 3) |
| **AUDIO** | `src/audio/audio.ts` | Faixa `'bonus'` (136 BPM) + SFX `'bomb'` e `'emerald'` |
| **DOCS** | `README.md`, `lore.md`, `AGENTS.md`, `.gitignore` | Documentação da Fase Bônus, regras e comandos |

## 6. Critérios de Aceite

- `npm run typecheck` e `npm run build` sem erros; `dist/` sem requisições externas.
- `node scripts/check-art.mjs` → `"arte OK"`, sem ausentes nem baixa resolução.
- `node scripts/check-bonus.mjs` → `"bonus OK"`.
- `node scripts/check-level.mjs` até `check-level6.mjs` → todos OK (Fases 1–5 intactas).
- Fluxos verificados:
  1. Fase 3 com `< 3` fitinhas → vai direto para a Fase 4.
  2. Fase 3 com `3/3` fitinhas → `bonus_intro` → `bonus` → `bonus_end` → Fase 4 (preservando moedas, vidas e pontos).
  3. `?fase=bonus` inicia o bônus diretamente após o título, funciona no teclado e nos botões touch, suporta pausa (`P`/`Esc`) e mute (`M`).

## 7. Regras para Subagentes

Iguais ao `PLAN.md §8`: edite só os arquivos do seu módulo; não altere contratos; TypeScript estrito com `import type`; zero dependências ou assets externos; todo texto em PT-BR; ao terminar rode `npx tsc --noEmit` corrigindo apenas erros dos seus arquivos e relate em poucas linhas o que fez. Não faça commits e não suba servidores.
