# Pardo Kidd in Quixadá World

Plataforma 2D retro 8-bit com seis fases e uma **Fase Bônus secreta ("Tubo do Bonfim")**, estágio especial pseudo-3D em meio-tubo desbloqueado após a Fase 3. **Fase 1, "Trilha dos Monólitos"** (sertão cearense): o Pardo sai do povoado, atravessa o Desfiladeiro Seco e a Subida da Galinha Choca, e chega à Capela do Horizonte para beber da Caneca Esmaltada. **Fase 2, "Coração da Amazônia"**: rio, cachoeiras e cipós até a aldeia, onde um alien de chapéu de explorador espera com a mamadeira do índio. **Fase 3, "Bahia World"** (subaquática): o sonho do Pardo no fundo da Baía de Todos-os-Santos, até o santuário da sereia Jandira e o Cajado Jailnesco — com todas as fitinhas coletadas, um vórtice leva à **Fase Bônus, "Tubo do Bonfim"** (corrida pseudo-3D em meio-tubo com o parceiro **Caramelo-Tails**). **Fase 4, "Favela do Rio"** (do morro ao Tribunal): sob um sol de 40°C, o Pardo sobe a favela carioca até o pátio do Tribunal, onde **Amaro**, o faxineiro, o espera com uma **Garrafa de Água Mineral**. **Fase 5, "Marginal de São Paulo"** (De Uber até o Galpão): autoscroller noturno em alta velocidade onde o Pardo vai surfando no teto de um carro sedã preto escrito `UBER` (com o motorista visível), pulando vãos do viaduto sobre o Rio Tietê e socando o trânsito paulistano até o desembarque VIP 5 estrelas na portaria da transportadora. **Fase 6, "Transportadora de São Paulo"** (Hora do Café): após desembarcar do Uber de madrugada, o Pardo atravessa o pátio, as docas e o galpão até a copa, onde o conferente **Renan Maia** lhe entrega um café. Detalhes em `lore.md`.

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
- **Fitinhas do Bonfim:** três fitinhas secretas espalhadas pelo recife e pelas ruínas. Cada uma vale 1000 pontos, e a HUD mostra quantas foram coletadas (n/3). Coletar **todas as 3 Fitinhas do Bonfim (`3/3`)** abre o vórtice do Cajado Jailnesco para a **Fase Bônus — "Tubo do Bonfim"** antes de seguir para a Fase 4 (com menos de 3 fitinhas, o jogo avança direto para a Fase 4).

## Fase Bônus — "Tubo do Bonfim" (Special Stage Pseudo-3D)

Ao vencer a Fase 3 com **`3/3` Fitinhas do Bonfim** (ou acessando diretamente via `?fase=bonus` / `?bonus=1`), o brilho do Cajado Jailnesco puxa o Pardo para um túnel caleidoscópico em meio-tubo sob o céu estrelado da Bahia.

- **Corrida no meio-tubo:** visto de costas em perspectiva pseudo-3D, `←`/`→` (`A`/`D`) fazem o Pardo correr pelas paredes laterais do tubo (soltar o direcional devolve suavemente ao centro), enquanto `↑`/`W` ou `Espaço`/`Z`/`J` saltam em direção ao centro do tubo para desviar de bombas de espinhos e alcançar arcos altos de moedas.
- **Parceiro Caramelo-Tails:** um vira-lata caramelo de cauda dupla giratória segue o rastro do Pardo logo adiante no túnel e ajuda a coletar moedas cooperativamente, **sem** fazer o jogador perder moedas caso encoste em bombas.
- **3 trechos e recompensa máxima:** o percurso tem 3 checkpoints com metas acumuladas progressivas (**20 → 45 → 70 moedas**) e **zero perda de vidas** (bombas descontam até 5 moedas da meta do bônus, mas nunca tiram vida). Bater as três metas e capturar o **Amuleto / Esmeralda do Bonfim** rende **+5000 pontos** e **+1 vida (`1UP`)**; em qualquer desfecho, todas as moedas e pontos conquistados seguem para a Fase 4.

## Fase 5 — "Marginal de São Paulo" (De Uber até o Galpão)

Após a água mineral do Amaro no Rio, o Pardo desembarca em São Paulo de madrugada e chama uma corrida pelo aplicativo para chegar a tempo do turno na transportadora. Fase **autoscroller** de alta velocidade inspirada em *Mega Man X4 (Jet Stingray)* e *Donkey Kong Country (Mine Cart Carnage)*, ao som de chiptune rock inspirado em *Mega Man*:

- **Surf no carro preto da Uber:** o Pardo viaja em cima do teto de um sedã preto escrito `UBER` na lateral (com o motorista visível ao volante). No referencial do veículo, `←`/`→` movem o Pardo para trás e para a frente sobre o carro e pela tela, preservando o embalo nos pulos para pousar de volta no teto do Uber.
- **Vãos do viaduto e obstáculos urbanos:** nos vãos abertos sobre a água do Rio Tietê, o carro mergulha pela rampa inferior e o Pardo precisa saltar de viaduto em viaduto, subir no teto de ônibus engarrafados e passarelas metálicas ou quebrar barreiras da CET no soco.
- **Bestiário paulistano (todos derrotados com 1 golpe):**
  - **Motoboy do Grau:** empina a moto ("dando grau") com faíscas e arranca em direção ao Pardo (1 soco).
  - **Drone de Delivery:** quadricóptero que flutua em senoide, trava a mira e dá um rasante diagonal (1 soco).
  - **Faria Limer de Patinete:** desliza pela pista e salta num *bunny-hop* com o patinete elétrico ao se aproximar (1 soco).
  - **Pichador do Viaduto:** posicionado no alto de ônibus e passarelas, arremessa latas de spray em arco que também podem ser destruídas no soco (+10 pontos; 1 soco derrota o pichador).

Objetivo: chegar ao **Desembarque VIP 5 Estrelas (`UBER 5★`)** na portaria da Transportadora de São Paulo e beber a água gelada de cortesia da corrida.

## Fase 6 — "Transportadora de São Paulo" (Hora do Café)

Depois de desembarcar do Uber 5 estrelas na portaria, o Pardo entra na transportadora de São Paulo de madrugada e atravessa o pátio, as docas e o galpão até a copa da expedição. Fase terrestre: os abismos são os fossos das docas.

Inimigos:

- **Rato de galpão:** 1 soco.
- **Carregador de caixa:** 2 socos. O primeiro quebra a caixa que ele carrega; sem ela, ele passa a correr atrás do Pardo no mesmo trecho.
- **Empilhadeira:** indestrutível. O soco só rebate nela. Telegrafa com um alerta antes de arrancar em alta velocidade.
- **Arremessador de encomendas:** fica no alto e joga pacotes em arco na direção do Pardo. Os pacotes podem ser socados (+10 pontos).

Objetivo: encontrar o **Renan Maia** na copa e tomar o café que encerra a campanha.

## Como rodar

Requer Node.js 20+.

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm run build      # checagem de tipos + build de produção em dist/
npm run preview    # serve o dist/ localmente
```

Atalhos de teste: `http://localhost:5173/?fase=2`, `?fase=3`, `?fase=4`, `?fase=5`, `?fase=6` ou `?fase=bonus` (ou `?bonus=1`) na URL começam direto na fase correspondente ou na Fase Bônus (porta padrão do Vite).

Checagens de fases e bônus:

```bash
node scripts/check-level.mjs        # valida o mapa da Fase 1
node scripts/check-level2.mjs       # valida o mapa da Fase 2
node scripts/check-level3.mjs       # valida o mapa da Fase 3 (dimensões, contagens, alcançabilidade a nado, fissuras)
node scripts/check-level4.mjs       # valida o mapa da Fase 4 (dimensões, contagens, alcançabilidade)
node scripts/check-level5.mjs       # valida o mapa da Fase 5 — Marginal de São Paulo (autoscroller no Uber)
node scripts/check-level6.mjs       # valida o mapa da Fase 6 — Transportadora de São Paulo
node scripts/check-bonus.mjs        # valida a Fase Bônus (3 trechos, metas 20/45/70, ondas de moedas/bombas e simulação)
```

## Deploy (Vercel)

```bash
vercel --prod
```

O projeto usa o framework Vite com saída em `dist` (ver `vercel.json`).

## Estrutura

Resumo; o detalhamento de módulos e donos está em `PLAN.md` (Fase 1), `PLAN-FASE2.md` (Fase 2), `PLAN-FASE3.md` (Fase 3), `PLAN-FASE4.md` (Fase 4), `PLAN-FASE5.md` (Fase 5 — Uber & reordenação da Fase 6), `PLAN-FASE6.md` (Transportadora) e `PLAN-BONUS.md` (Fase Bônus).

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
    level3.ts       Fase 3 "Bahia World" (subaquática)
    level4.ts       Fase 4 "Favela do Rio"
    level5.ts       Fase 5 "Marginal de São Paulo" (autoscroller no Uber)
    level6.ts       Fase 6 "Transportadora de São Paulo"
    bonus.ts        Fase Bônus "Tubo do Bonfim" (meio-tubo pseudo-3D)
    objects.ts      moedas, plataformas, cipó-d'água, alien, caneca
    objects3.ts     bolhas, fitinhas do Bonfim, Jandira e cajado (Fase 3)
    objects4.ts     filtro de barro e Amaro (Fase 4)
    objects5.ts     carro preto da Uber, cooler 5 estrelas e desembarque (Fase 5)
    objects6.ts     bebedouro, movers e Renan Maia (Fase 6)
    enemies.ts      inimigos (Fases 1–2)
    enemies3.ts     inimigos marinhos (Fase 3)
    enemies4.ts     inimigos cariocas (Fase 4)
    enemies5.ts     inimigos da Marginal: motoboy, drone, patinete e pichador (Fase 5)
    enemies6.ts     inimigos da transportadora (Fase 6)
    hud.ts          HUD e telas
  gfx/              paleta, sprites em grade de caracteres, atlas, fontes
    background.ts     parallax do sertão (Fase 1)
    background2.ts    parallax da Amazônia (Fase 2)
    background3.ts    parallax subaquático da Bahia (Fase 3)
    background4.ts    parallax do Rio de Janeiro (Fase 4)
    background5.ts  parallax noturno da Marginal Tietê / Ponte Estaiada (Fase 5)
    background6.ts  parallax da transportadora de São Paulo (Fase 6)
    art/enemies2.ts   sprites dos inimigos da Fase 2 (onça, jacaré, cobra, tucano)
    art/amazon.ts     tiles e decoração da Amazônia (Fase 2)
    art/pardoSwim.ts  sprites de nado do Pardo (Fase 3)
    art/bahia.ts      tiles, recife, ruínas e objetos da Bahia (Fase 3)
    art/sea.ts        sprites dos inimigos marinhos (Fase 3)
    art/jandira.ts    sprites da sereia Jandira e do Cajado Jailnesco (Fase 3)
    art/bonus.ts      sprites da Fase Bônus (Pardo de costas, Caramelo-Tails, tubo)
    art/amaro.ts      sprites do Amaro, garrafa de água mineral e Pardo bebendo (Fase 4)
    art/enemies4.ts   sprites dos inimigos da Fase 4
    art/rio.ts        tiles, objetos e decoração do Rio (Fase 4)
    art/uber.ts       carro preto da Uber, desembarque 5★, tiles e objetos da Marginal (Fase 5)
    art/enemies5.ts   sprites dos inimigos da Fase 5 (motoboy, drone, patinete, pichador)
    art/maia.ts       sprites do Renan Maia, xícara de café e Pardo bebendo (Fase 6)
    art/enemies6.ts   sprites dos inimigos da Fase 6
    art/sampa.ts      tiles, objetos e decoração da transportadora (Fase 6)
  audio/audio.ts    SFX e música chiptune via Web Audio
scripts/            check-art.mjs, check-level.mjs, check-level2.mjs, check-level3.mjs, check-level4.mjs, check-level5.mjs, check-level6.mjs, check-bonus.mjs
```

## Sobre os recursos

Todos os gráficos (sprites, tiles, parallax, fonte) e todos os sons e a música são gerados por código em tempo de execução. Não há imagens, sons ou fontes externas.

## Créditos

Projeto de fã, original, inspirado na estética dos plataformas 8-bit clássicos. Personagem, mundo, inimigos, fases e música são criações próprias. Não reproduz sprites, fases, melodias ou marcas de jogos existentes.
