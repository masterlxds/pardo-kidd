# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

"Pardo Kidd in Quixadá World": plataforma 2D 8-bit em TypeScript + Vite, sem dependências de runtime. Cinco fases (Sertão, Amazônia, Bahia subaquática, Favela do Rio, Transportadora de São Paulo). Texto do jogo, docs e comentários estão em português (pt-BR); mantenha esse idioma. Lore em `lore.md`, README com controles e regras.

## Comandos

```bash
npm install
npm run dev          # Vite em http://localhost:5173 (?fase=2 … ?fase=5 pula direto para a fase)
npm run typecheck    # tsc --noEmit
npm run build        # tsc --noEmit + vite build → dist/
npm run check:art    # node scripts/check-art.mjs: valida a arte contra SPRITE_SPEC/PALETTE e gera PNG de preview
node scripts/check-level.mjs | check-level2.mjs | check-level3.mjs | check-level4.mjs | check-level5.mjs   # valida o mapa ASCII de cada fase (--print em level3)
```

Não há framework de testes nem linter; a verificação é `typecheck` + os scripts `check-*` + jogar no navegador. Os scripts `.mjs` importam `.ts` direto (`../src/...ts`), então rodam com Node moderno (type stripping), sem build. Deploy: `vercel --prod`.

## Arquitetura

- **Tudo é gerado por código**: sem imagens, sons ou fontes externos. Sprites são grades de caracteres (`src/gfx/art/*.ts`) mapeadas por `src/gfx/palette.ts` e rasterizadas em `createAtlas()` (`gfx/atlas.ts`) no boot. Parallax em `gfx/background*.ts` (um por fase), áudio chiptune via Web Audio em `audio/audio.ts`.
- **`gfx/spec.ts` (`SPRITE_SPEC`) é o contrato** de todo sprite: `nome → [largura, altura, frames]` em unidades lógicas. Para adicionar um sprite: entrada em `spec.ts`, arte no `art/*.ts` correspondente, e (se for um arquivo de arte novo) registrar o objeto no spread de `createAtlas()` **e** em `scripts/check-art.mjs`. Arte autorada em 2× (`RENDER_SCALE`) é usada direto; arte 1× é ampliada.
- **Resolução**: mundo lógico 320×180, `TILE=16`, canvas em `RENDER_SCALE=2×`; simulação em passo fixo de 1/60 s (`core/loop.ts`). `core/constants.ts` também define o envelope de pulo (≈3 tiles de altura, ≈4 de alcance), que é **contrato para o level design** (degraus ≤2 tiles, abismos ≤3).
- **Fases são mapas ASCII**: `game/level1.ts`, `level2.ts`, `level3.ts`, `level4.ts` e `level5.ts` exportam `ROWS` + legenda/movers; `game/level.ts` (`buildLevel`) converte em tiles e instancia entidades via tabela de marcadores (caractere → inimigo/objeto). `game/levels.ts` registra as fábricas em `LEVELS`; `GameState.levelIndex` indexa nela. Ao mexer em mapa, rode o `check-levelN.mjs` correspondente (valida dimensões, contagens e alcançabilidade).
- **Fase 3 é subaquática** (`Level.underwater`): outra física de nado no `player.ts`, oxigênio, inimigos em `game/enemies3.ts`, objetos em `objects3.ts`. Fases 1–2 usam `enemies.ts` / `objects.ts`; a Fase 4 usa `enemies4.ts` / `objects4.ts` e a Fase 5 usa `enemies5.ts` / `objects5.ts` (ambas terrestres).
- **`game/game.ts`** é o orquestrador: cenas (título/intro/jogo/pausa/game over/vitória), mundo, câmera, partículas, HUD (`hud.ts`), seleção de background por fase. `core/types.ts` concentra as interfaces compartilhadas (`Level`, `Entity`, `World`, `SpriteAtlas`, `AudioApi`...).
- `index.html` é o contrato de DOM (`#stage`, `#game`, `#touch`, `#btn-*`) usado por `main.ts`, `core/input.ts` e `style.css` (controles touch).

## Documentos de planejamento

`PLAN.md`, `PLAN-FASE2.md`, `PLAN-FASE3.md`, `PLAN-FASE4.md`, `PLAN-FASE5.md`, `level 3/gdd_*.md`, `level-4-refs/` e `level-5-refs/` (GDDs e bestiários) descrevem módulos, donos e design de cada fase; `PLAN.md`, `prompt.md` e `lore.md` estão no `.gitignore`. Consulte-os para a intenção de design antes de mudar mecânicas.
