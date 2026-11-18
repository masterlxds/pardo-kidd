# Level Design: *Fase 5 — Marginal de São Paulo*

> **Versão 2 (18/11/2026).** Mapa, legenda, regras de justiça e a **partitura** da fase, compasso a compasso. É a especificação de `src/game/level5.ts` e de `scripts/check-level5.mjs`.
> Mecânica em [`gdd_fase5_marginal.md`](gdd_fase5_marginal.md); entidades em [`gdd_bestiario_fase5.md`](gdd_bestiario_fase5.md).

---

## 1. Grade

- **888 colunas × 12 linhas** (`TILE = 16` → 14 208 × 192 px). Câmera Y travada em 12.
- **1 compasso = 12 colunas = 1,6 s. 1 tempo = 3 colunas = 0,4 s.** O compasso `n` (a partir de 1) começa na coluna `12 × (n − 1)`; o tempo `t` (1 a 4) ocupa as colunas `+3(t − 1)` a `+3(t − 1) + 2`. Todo marcador de ameaça fica na **primeira coluna do seu tempo**.
- 74 compassos → **1 min 58 s** de rolagem.

| Linha | y (px) | Uso |
|---|---|---|
| 0–1 | 0–32 | Céu; HUD por cima. Nada de jogo |
| 2–4 | 32–80 | Estrutura de pórticos, cordas, teto do túnel (decoração) |
| **5** | 80–96 | **Faixa alta:** `G`, `i`, `X`, drone pairando, corpo do pichador |
| 6–7 | 96–128 | Livre: arcos de moedas |
| **8** | 128–144 | **Faixa baixa:** `L`, `F`, `B`, `W`, `y`, `Y`, `p`, `x`, moedas em linha |
| 9 | 144–160 | Carro (teto em y = 144). Spawn `P` e objetivo `A` nesta linha |
| 10 | 160–176 | Pista (`=`, asfalto). Vazia (`.`) nos vãos de rampa |
| 11 | 176–192 | Mureta e pilares (`#`); `~` (Tietê, só visual) nos vãos; decoração e `K` |

Não existe tile sólido acima da linha 10, nem tile letal em lugar nenhum.

## 2. Legenda do mapa

- **Tiles:** `.` vazio · `=` asfalto · `#` mureta/pilar · `~` água do Tietê (decorativa nesta fase).
- **Obstáculos:** `L` limitador (pule) · `F` faixa de obra, 2 colunas (pule) · `G` placa de pórtico, 3 colunas (não pule) · `i` luminária (não pule).
- **Socáveis:** `B` barreira da CET · `W` isopor (+1 gota).
- **Inimigos** (a coluna é o ponto de encontro na posição neutra): `y` motoboy · `Y` motoboy rápido · `p` patinete · `u` drone (linha 8: onde o rasante termina) · `z` pichador (linha 5) · `x` caixa baixa · `X` caixa alta.
- **Estrutura:** `P` spawn + carro · `K` checkpoint por passagem · `J` início de rampa (12 colunas de voo) · `T` entrada do caminhão-baú (fica 8 compassos) · `A` desembarque 5★ · `c` moeda · `1` `2` `3` `4` placas de tutorial (pule, soque, não pule, pule + soque; na partitura aparecem como `t`). O `J` vai só na primeira coluna do compasso da rampa.
- **Decoração:** `s` placa da Marginal · `r` radar · `l` poste · `n` cone.

## 3. Como o arquivo é escrito

Uma linha de 888 caracteres não se edita à mão. `level5.ts` continua sendo dados puros, sem imports, mas passa a ser montado por compassos:

- `LEVEL5_BARS: string[][]`: 74 blocos de **12 colunas × 12 linhas**, um por compasso, cada um com um comentário `// c.NN — <descrição>`.
- `LEVEL5_ROWS` é a concatenação horizontal dos blocos, feita no próprio módulo. `buildLevel` não muda.
- Compassos repetidos (respiros, trechos de túnel) podem reutilizar constantes de bloco nomeadas.

## 4. Regras de justiça (o validador reprova se quebrar)

| # | Regra | Motivo |
|---|---|---|
| R1 | `L`/`F` nunca na mesma coluna, nem a menos de 2 colunas, de `G`/`i`/`X` | O pulo curto não passa entre os dois |
| R2 | Depois de um obstáculo de pular, coisa na faixa alta só **2 tempos** depois | 0,8 s > 0,67 s de voo |
| R3 | Depois que uma `G` ou `i` termina, obstáculo de pular só **1 tempo** depois | Precisa de chão para decolar |
| R4 | Dois obstáculos de pular seguidos: **3 tempos** de distância; **2 tempos** só nos Atos 3 e 4 | Pulo duplo ritmado é habilidade avançada |
| R5 | Dois alvos de soco seguidos: no mínimo **1 tempo** | 0,4 s > 0,22 s do soco |
| R6 | Embaixo de `G`/`i` só entram `B`, `y`, `Y`, `p`, `x` e moedas | Padrão "soco obrigatório" |
| R7 | O compasso de cada `K`, o de cada `J` e os 4 primeiros e 3 últimos da fase não têm ameaça | Fôlego ao renascer e nos saltos |
| R8 | A cada 4 compassos de ato, 1 é respiro (no máximo moedas ou `W`) | Frase musical |
| R9 | Decisões por compasso: Ato 1 ≤ 1 (≤ 2 nos 4 últimos); Ato 2 ≤ 2; Atos 3 e 4 ≤ 3. Fila de patinetes conta 1 | Curva de densidade |
| R10 | Toda janela de soco ≥ 9 quadros e toda janela de decolagem ≥ 6 quadros com direcional solto; ≥ 12 e ≥ 9 no Ato 1 | Piso de reação humana |

## 5. Validador (`scripts/check-level5.mjs`)

Substitui por inteiro o validador atual, que simulava plataforma com busca em largura sobre posições de apoio. O novo:

1. **Estático:** dimensões 888×12, legenda, alinhamento ao tempo, R1–R9, contagens da §7, nenhum sólido acima da linha 10.
2. **Bot determinístico:** porta fiel de `PHYS` e do soco de `player.ts`, com a posição das entidades calculada pela fórmula da câmera do bestiário. Busca em largura sobre o estado `(quadro, y, vy, pulo segurado, relógio do soco)` com o Pardo **na posição neutra, sem direcional**. Duas passadas:
   - **envelope reduzido** (pulo a 95 %): precisa existir uma execução do começo ao fim **sem levar dano**, o que prova que a fase fecha só com pulo e soco;
   - **envelope real**: toda moeda é coletável, todo `W`, `B` e inimigo é socável, e R10 vale para cada decisão.
3. **Robustez:** repete a passada real com o Pardo fixo nos extremos (aproximação de 80 e de 160 px/s) e só **avisa** onde alguma decisão deixar de ter solução.
4. `--print` imprime a partitura com o tempo em segundos, a resposta esperada e a janela em quadros de cada decisão. `LEVEL5_FILE=<caminho>` valida uma cópia.

## 6. Partitura

Cada compasso mostra os 4 tempos. `·` = vazio. `G+y` = motoboy embaixo da placa (soco obrigatório). `J` ocupa o compasso inteiro. Moedas entre parênteses são o tipo de trilha: `(linha)` na faixa baixa, `(arco)` na trajetória de um pulo.

### Embarque (c.1–4)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 1 | P | · | · | · | Pardo já no teto; o carro arranca |
| 2 | c | c | c | c | (linha) — sentir o direcional |
| 3 | t | · | L | · | Placa `PULE` e o primeiro limitador |
| 4 | · | c | c | · | (arco) — desenha o pulo ideal |

### Ato 1 — Marginal Tietê (c.5–20): um verbo por vez

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 5 | · | · | L | · | |
| 6 | · | · | · | L | Mesmo verbo, tempo diferente |
| 7 | t | · | B | · | Placa `SOQUE` e a primeira barreira |
| 8 | c | c | · | · | Respiro |
| 9 | · | · | y | · | Primeiro motoboy (`rev` 1,35 s antes) |
| 10 | · | L | · | · | |
| 11 | · | · | y | · | |
| 12 | · | c | c | · | Respiro (arco) |
| 13 | t | · | G | · | Placa `NÃO PULE`; linha de moedas embaixo da `G` |
| 14 | · | · | G+B | · | Primeiro soco obrigatório |
| 15 | L | · | · | y | Pulo, depois soco |
| 16 | · | W | · | · | Respiro + isopor |
| 17 | · | · | u | · | Primeiro drone: paira o compasso inteiro, avisa, desce |
| 18 | L | · | · | B | |
| 19 | · | y | · | G | |
| 20 | y | · | L | · | Fecho do ato |

### Rampa 1 (c.21–22)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 21 | K | · | c | c | Checkpoint 1 (0:32) |
| 22 | J | J | J | J | Salto para o Minhocão; arco grande de moedas; troca de cenário |

### Ato 2 — Minhocão (c.23–38): dois verbos combinados

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 23 | · | p | p | · | Primeira fila de patinetes: soco, soco |
| 24 | · | L | · | y | |
| 25 | p | p | p | · | Fila de 3 |
| 26 | · | c | c | · | Respiro (arco) |
| 27 | t | · | z | · | Placa `PULE + SOQUE`; primeiro pichador |
| 28 | · | L | · | B | |
| 29 | z | · | · | y | Soco no ar, pouso, soco no chão |
| 30 | · | W | · | · | Respiro + isopor |
| 31 | G+y | · | L | · | Soco obrigatório, depois pulo |
| 32 | u | · | p | p | Rasante e fila |
| 33 | L | · | · | z | Pulo, depois pulo com soco |
| 34 | · | c | c | · | Respiro |
| 35 | y | · | y | · | Dois motoboys a 2 tempos |
| 36 | G+B | · | u | · | |
| 37 | F | · | · | y | Primeira faixa de obra: decolar mais cedo |
| 38 | z | · | · | L | Fecho do ato |

### Rampa 2 (c.39–40)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 39 | K | · | c | c | Checkpoint 2 (1:01) |
| 40 | J | J | J | J | Salto do fim do elevado para a boca do túnel |

### Ato 3 — Túnel (c.41–56): sem poder pular

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 41 | i | · | i | · | Só luminárias, com linha de moedas: aprender a ficar no chão |
| 42 | i | y | i | · | |
| 43 | i | B | i | y | |
| 44 | · | c | c | · | Respiro: trecho sem luminária (arco) |
| 45 | · | · | Y | · | Primeiro motoboy rápido, isolado |
| 46 | i | p | p | i | Fila sob as luzes |
| 47 | Y | · | i+B | · | |
| 48 | · | W | · | · | Respiro + isopor |
| 49 | L | · | L | · | Contraste: obra no túnel, pulo duplo ritmado (R4) |
| 50 | · | y | · | L | |
| 51 | · | i | u | · | Rasante por baixo das luzes |
| 52 | c | c | · | · | Respiro |
| 53 | i+y | i+y | i+y | · | **Rajada:** três socos no tempo. O ponto alto do ato |
| 54 | · | L | · | Y | |
| 55 | p | p | p | p | Fila de 4 |
| 56 | i+B | · | F | · | Fecho do ato |

### Saída do túnel (c.57–58)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 57 | K | · | c | c | Checkpoint 3 (1:30); amanhece |
| 58 | · | W | · | T | Isopor; o caminhão-baú entra buzinando |

### Ato 4 — Ponte Estaiada (c.59–70): tudo junto, mais as caixas

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 59 | · | · | x | · | Primeira caixa baixa |
| 60 | x | · | X | · | Baixa, depois alta |
| 61 | x | x | · | L | |
| 62 | · | c | c | · | Respiro |
| 63 | X | · | x | y | |
| 64 | L | · | x | x | |
| 65 | z | · | x | · | Pichador pendurado num estai |
| 66 | · | c | c | · | Respiro; o caminhão pega a saída `TRANSPORTADORA →` |
| 67 | Y | · | L | · | |
| 68 | p | p | · | u | |
| 69 | G+y | · | F | · | |
| 70 | y | · | z | · | Última ameaça da fase |

### Salto final e desembarque (c.71–74)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 71 | J | J | J | J | Salto final sobre a obra da ponte; o maior arco de moedas |
| 72 | · | c | c | · | A rolagem desacelera |
| 73 | c | c | c | c | Portaria da Transportadora |
| 74 | · | · | A | · | Totem `UBER 5★` |

## 7. Contagens (o validador confere com tolerância de ±2 por tipo)

| Elemento | Qtde. | Elemento | Qtde. |
|---|---|---|---|
| `L` limitador | 19 | `y` motoboy | 20 |
| `F` faixa de obra | 3 | `Y` motoboy rápido | 4 |
| `G` placa | 6 | `p` patinete | 15 |
| `i` luminária | 14 | `u` drone | 5 |
| `B` barreira | 8 | `z` pichador | 6 |
| `W` isopor | 4 | `x` / `X` caixas | 8 / 2 |
| `K` checkpoint | 3 | `J` rampa | 3 |

Moedas: de 90 a 110 no total, sempre em linha na faixa baixa ou em arco de pulo. Nenhuma moeda exige direcional.

A partitura é a intenção de design. O dono do mapa pode mover um elemento de tempo ou trocar dois compassos de lugar para o validador passar, desde que mantenha as estreias na ordem da tabela, a curva de densidade (R9) e os três pontos altos: o soco obrigatório do c.14, a rajada do c.53 e o comboio dos c.59–65.
