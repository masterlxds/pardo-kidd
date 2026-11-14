# Pardo Kidd in Quixadá World

Plataforma 2D retro 8-bit no sertão cearense. Fase 1, "Trilha dos Monólitos": o Pardo sai do povoado, atravessa o Desfiladeiro Seco e a Subida da Galinha Choca, e chega à Capela do Horizonte para beber da Caneca Esmaltada.

## Controles

**Teclado**

- `←` `→` ou `A` `D`: mover
- `↑` ou `W`: pular (segure para pular mais alto)
- `Espaço`, `Z` ou `J`: socar (Soco da Caatinga)
- `Enter`: começar / jogar novamente
- `P` ou `Esc`: pausa · `M`: som

**Toque**
- Botões ◀ ▶ no canto inferior esquerdo; SOCO e PULO no canto inferior direito.
- O botão ♪ no canto superior direito liga/desliga o som.

## Como rodar

Requer Node.js 20+.

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm run build      # checagem de tipos + build de produção em dist/
npm run preview    # serve o dist/ localmente
```

## Deploy (Vercel)

```bash
vercel --prod
```

O projeto usa o framework Vite com saída em `dist` (ver `vercel.json`).

## Estrutura

Resumo; o detalhamento de módulos e donos está em `PLAN.md`.

```
index.html          contrato de DOM (#stage, #game, #touch, #btn-*)
src/
  main.ts           bootstrap
  style.css         layout responsivo e controles touch
  core/             tipos, constantes, loop de passo fixo, input, física
  game/             cenas, jogador, fases, objetos, inimigos, HUD
  gfx/              paleta, sprites em grade de caracteres, atlas, fundo parallax, fonte
  audio/audio.ts    SFX e música chiptune via Web Audio
```

## Sobre os recursos

Todos os gráficos (sprites, tiles, parallax, fonte) e todos os sons e a música são gerados por código em tempo de execução. Não há imagens, sons ou fontes externas.

## Créditos

Projeto de fã, original, inspirado na estética dos plataformas 8-bit clássicos. Personagem, mundo, inimigos, fases e música são criações próprias. Não reproduz sprites, fases, melodias ou marcas de jogos existentes.
