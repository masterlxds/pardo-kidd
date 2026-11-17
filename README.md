# Pardo Kidd in Quixadá World

Plataforma 2D retro 8-bit com três fases. **Fase 1, "Trilha dos Monólitos"** (sertão cearense): o Pardo sai do povoado, atravessa o Desfiladeiro Seco e a Subida da Galinha Choca, e chega à Capela do Horizonte para beber da Caneca Esmaltada. **Fase 2, "Coração da Amazônia"**: rio, cachoeiras e cipós até a aldeia, onde um alien de chapéu de explorador espera com a mamadeira do índio. **Fase 3, "Bahia World"** (subaquática): o sonho do Pardo no fundo da Baía de Todos-os-Santos, até o santuário da sereia Jandira e o Cajado Jailnesco. Detalhes em `lore.md`.

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

## Regras gerais

- **Dificuldade (tela de título, "Selecione a dificuldade"):** **Normal** começa com 3 vidas; **Amaro** (fácil) começa com 99. Setas ←/→ escolhem e Enter inicia; no toque/clique, basta tocar na opção.
- **Vida extra:** a cada 100 moedas o Pardo ganha 1 vida e o contador de moedas zera.
- As moedas coletadas **não** se perdem ao morrer (só ao recomeçar o jogo depois de um game over).

## Fase 3 — "Bahia World" (subaquática)

Pardo adormece e sonha com o fundo do mar da Baía de Todos-os-Santos. De snorkel, nada pelo Recife de Corais e pelas Ruínas Submersas até o Santuário, onde a sereia Jandira guarda o **Cajado Jailnesco** num altar. O sonho termina com o ritual da lambida e a tela "PARDO LAMBEU O CAJADO JAILNESCO".

Mecânicas novas:

- **Nado:** o botão de pulo vira braçada. Cada toque dá um impulso para cima; sem toques, o Pardo afunda devagar. O movimento horizontal tem um leve deslize. O soco continua sendo o único ataque, inclusive nadando.
- **Oxigênio:** a barra tem 5 bolhas e se esvazia em cerca de 30 segundos. Com uma bolha restante, aparece uma contagem regressiva de 5 a 1 sobre a cabeça do Pardo. Ficar sem ar custa uma vida. O ar volta ao máximo ao tocar as bolhas grandes soltas pelas **fissuras de bolhas** e ao chegar perto da Jandira.
- **Inimigos de 1 e 2 socos:** a maioria cai com um soco. Os blindados (baiacu-dentão, siri, tartaruga e moreia) atordoam com o primeiro soco, por cerca de 1,5 s, e são derrotados pelo segundo. O siri bloqueia socos pela frente enquanto está em guarda.
- **Fitinhas do Bonfim:** três fitinhas secretas espalhadas pelo recife e pelas ruínas. Cada uma vale 1000 pontos, e a HUD mostra quantas foram coletadas (n/3).

## Como rodar

Requer Node.js 20+.

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm run build      # checagem de tipos + build de produção em dist/
npm run preview    # serve o dist/ localmente
```

Atalhos de teste: `http://localhost:5173/?fase=2` começa direto na Fase 2 e `http://localhost:5173/?fase=3` começa direto na Fase 3 (porta padrão do Vite).

Checagens de mapa:

```bash
node scripts/check-level.mjs    # valida o mapa da Fase 1
node scripts/check-level2.mjs   # valida o mapa da Fase 2
node scripts/check-level3.mjs   # valida o mapa da Fase 3 (dimensões, contagens, alcançabilidade a nado, fissuras)
```

## Deploy (Vercel)

```bash
vercel --prod
```

O projeto usa o framework Vite com saída em `dist` (ver `vercel.json`).

## Estrutura

Resumo; o detalhamento de módulos e donos está em `PLAN.md` (Fase 1) e `PLAN-FASE2.md` (Fase 2).

```
index.html          contrato de DOM (#stage, #game, #touch, #btn-*)
src/
  main.ts           bootstrap
  style.css         layout responsivo e controles touch
  core/             tipos, constantes, loop de passo fixo, input, física
  game/
    game.ts         cenas, mundo, câmera, partículas
    player.ts       máquina de estados do Pardo
    levels.ts       registro das fases (LEVELS, LEVEL_COUNT)
    level.ts        construtor genérico de fases (mapa ASCII, tiles)
    level1.ts       Fase 1 "Trilha dos Monólitos"
    level2.ts       Fase 2 "Coração da Amazônia"
    objects.ts      moedas, plataformas, cipó-d'água, alien, caneca
    enemies.ts      inimigos
    hud.ts          HUD e telas
  gfx/              paleta, sprites em grade de caracteres, atlas, fontes
    background.ts   parallax do sertão (Fase 1)
    background2.ts  parallax da Amazônia (Fase 2)
    art/enemies2.ts sprites dos inimigos da Fase 2 (onça, jacaré, cobra, tucano)
    art/amazon.ts   tiles e decoração da Amazônia (Fase 2)
  audio/audio.ts    SFX e música chiptune via Web Audio
scripts/            check-art.mjs, check-level.mjs, check-level2.mjs, check-level3.mjs
```

## Sobre os recursos

Todos os gráficos (sprites, tiles, parallax, fonte) e todos os sons e a música são gerados por código em tempo de execução. Não há imagens, sons ou fontes externas.

## Créditos

Projeto de fã, original, inspirado na estética dos plataformas 8-bit clássicos. Personagem, mundo, inimigos, fases e música são criações próprias. Não reproduz sprites, fases, melodias ou marcas de jogos existentes.
