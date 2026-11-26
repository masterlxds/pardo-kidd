# Level Design: *Fase 7 — Espaço Sideral (Órbita de Quixadá)*

> **Versão 1 (26/11/2026).** Mapa, legenda, regras de justiça e a **partitura** da fase, compasso a compasso. É a especificação de `src/game/level7.ts` e de `scripts/check-level7.mjs`.
> Mecânica e contratos em [`PLAN-FASE7.md`](../PLAN-FASE7.md) e [`gdd_fase7_espaco.md`](gdd_fase7_espaco.md); entidades em [`gdd_bestiario_fase7.md`](gdd_bestiario_fase7.md).

---

## 1. Grade

- **780 colunas × 11 linhas** (`TILE = 16` → 12 480 × 176 px). Câmera Y travada em 0 (`y` de mundo = `y` de tela).
- **1 compasso = 12 colunas = 2,0 s. 1 tempo = 3 colunas = 0,5 s** (120 BPM a `SPACE.scrollSpeed = 96 px/s` = 6 colunas/s). O compasso `n` (1 a 65) começa na coluna `12 × (n − 1)`; o tempo `t` (1 a 4) ocupa as colunas `+3(t − 1)` a `+3(t − 1) + 2`.
- 65 compassos → **2 min 10 s** de travessia orbital (compassos 62–63 desaceleram até a parada em `SPACE_STOP_CAM_X = 12096` no início do c.64; c.64–65 acoplagem na EEIQ).
- Todos os marcadores são ancorados no **centro da célula** (`x = col × 16 + 8`, `y = row × 16 + 8`). **Não existe nenhum tile sólido** nesta fase.

| Linha | Centro y (px) | Uso principal |
|---|---|---|
| 0 | 8 | Margem superior (fora dos limites seguros do Pardo `y ∈ [18, 162]`) |
| **1** | 24 | Topo jogável: `S` superior (`topY = 22`), `g` descendente (45°), arcos altos |
| **2–3** | 40–56 | **Faixa planetária superior** (`y ∈ [38, 68]`, ou `[38, 52]` com `wave`), hologramas `t`, moedas |
| **4–6** | 72–104 | **Faixa central**: spawn `P` (linha 5), `K`, `W`, `N`, `A` (linha 5), rota neutra e desvios |
| **7–8** | 120–136 | **Faixa planetária inferior** (`y ∈ [112, 142]`, ou `[128, 142]` com `wave`), moedas de estilingue |
| **9** | 152 | Base jogável: `S` inferior (`bottomY = 158`), `g` ascendente (45°), obstáculos/inimigos baixos |
| 10 | 168 | Margem inferior (fora dos limites seguros do Pardo `y ∈ [18, 162]`) |

---

## 2. Legenda do mapa

- **Estrutura e coletáveis:** `.` vazio · `P` spawn do Pardo Astronauta (c.1, linha 5, col 4) · `K` boia de checkpoint orbital (ativação por passagem; 1,8 s sem ameaças após respawn em `Kx − 64`) · `c` moeda estelar · `W` cápsula de água espacial (+1 gota, não fere) · `t` holograma de tutorial (quadro pela ordem: `0` MOVA 2D, `1` IMPULSO, `2` GRAVIDADE) · `A` Estação Espacial de Quixadá — EEIQ (c.65, linha 5, col 6).
- **Planetas gravitacionais letais (`LEVEL7_PLANETS`):** `Y` Planeta Yuri · `U` Planeta Yumi (puxam em `R_grav = 92 px`, instakill em `R_kill = 21 px`, telegraph `1,2 s` = 7,2 colunas antes da entrada, velocidade `−72 px/s` em tela).
- **Inimigos destrutíveis no soco (1 HP):** `m` meteoro comum · `M` meteoro flamejante (aviso 0,5 s) · `g` cometa de gelo diagonal (linhas 0–4 desce; 6–10 sobe; aviso 0,7 s) · `u` OVNI patrulheiro (senoide + `plasma_orb`) · `a` alien de jetpack · `b` mina orbital magnética (socável apenas desarmada).
- **Obstáculos indestrutíveis & Clímax:** `s` satélite em órbita · `S` satélite de varredura (feixe laser vertical) · `d` lixo espacial · `v` rajada de vento solar (faixa horizontal telegrafada 1,0 s) · `N` Nave-Mãe alienígena (c.50; escolta com ondas em `LEVEL7_WAVES`).

---

## 3. Como o arquivo é escrito

`src/game/level7.ts` não possui imports (lido diretamente por Node em `scripts/check-level7.mjs`):
- `LEVEL7_BARS: string[][]`: 65 blocos de **12 colunas × 11 linhas**, um por compasso.
- `LEVEL7_ROWS: string[]`: concatenação horizontal automática dos 65 blocos (`780 × 11`).
- `LEVEL7_PLANETS: Level7Planet[]`: lista ordenada por `col` com `{ col, kind, y, wave? }`, espelhando exatamente cada marcador `Y`/`U`.
- `LEVEL7_WAVES: Level7Wave[]`: ondas determinísticas `{ bar, beat, kind, y }` da Nave-Mãe no Ato 4.

---

## 4. Regras de justiça (R1–R8)

| # | Regra | Como este mapa cumpre |
|---|---|---|
| **R1** | Planetas só nas faixas de D5: `y ∈ [38, 68] ∪ [112, 142]`, ou `[38, 52] ∪ [128, 142]` se `wave: true`; coincidência exata com `Y`/`U` | Todos os 10 planetas estão em `y ∈ {46, 48, 50, 52, 130, 132, 136}`; os 2 planetas com `wave: true` estão em `y = 46` e `y = 132` |
| **R2** | Estreia isolada dos 12 elementos (`m, M, s, d, Y, u, a, g, U, b, S, v`): nenhum outro perigo simultâneo na tela (nem em telegraph) durante a estreia | Cada estreia tem janela exclusiva de `warn + active` sem sobreposição com nenhum outro perigo |
| **R3** | Corredor seguro ≥ 64 px em `y ∈ [18, 162]` fora de `R_kill + 9 px`, livre de `s`, `S`, `d`, `v` durante passagem de planeta | Nenhum `s`, `S`, `d`, `v` sobrepõe passagem ou aviso de planeta |
| **R4** | Nada nos 1,8 s iniciais (`col 0..31`) nem nos 1,8 s após cada `K` (`Ck .. Ck + 27` para ameaças; `Ck .. Ck + 34` para planetas; nada anterior ativo no respawn `Kx − 64`) | Primeiro `m` em `col 33`; `K` em `col 204, 384, 576`; ameaças retomam só em `col ≥ Ck + 29`; planeta anterior termina ≥ 15 cols antes de `K` |
| **R5** | Telegraph de planeta (`1,2 s`) nunca coincide com telegraph de `v` ou `S` | Nenhuma sobreposição entre avisos de `Y`/`U` e de `v`/`S` |
| **R6** | No máximo 2 planetas simultâneos na tela, e só nos Atos 3–4 | Atos 1, 2 e 4: no máximo 1 planeta por vez (≥ 38 cols entre centros). Ato 3: apenas o par escalonado em "S" (`U` #3 col 538 + `Y` #5 col 556) |
| **R7** | Contagens mínimas: ≥ 6 planetas (alvo 9+), 3 `K`, ≥ 4 `W`, ≥ 120 moedas, ≥ 1 de cada inimigo/obstáculo | **10 planetas** (6 Yuri + 4 Yumi), **3 `K`**, **6 `W`**, **159 moedas**, `m=8, M=3, g=3, u=3, a=3, b=3, s=3, S=2, d=3, v=2`, `N` e **9 ondas** |
| **R8** | Hologramas `t` só no Embarque e antes do 1º Yuri | Exatamente 3 `t`: c.1 (`col 9`), c.2 (`col 14`) e c.11 (`col 126`, antes do `Y` #1 na `col 146`) |

---

## 5. Tabela de estreias

| Ordem | Compasso (Coluna) | Marcador | Elemento | Janela de isolamento (`camX` em colunas) |
|---|---|---|---|---|
| 1 | c.3 col 7 (`31`) | `m` | Meteoro Comum | `11,5 .. 26,7` (após grace inicial `0 .. 10,8`) |
| 2 | c.6 col 9 (`69`) | `M` | Meteoro Flamejante | `warn 46,5 .. done 60,0` |
| 3 | c.7 col 9 (`81`) | `s` | Satélite em Órbita | `61,5 .. 80,3` |
| 4 | c.9 col 4 (`100`) | `d` | Lixo Espacial | `80,5 .. 98,0` |
| 5 | c.13 col 2 (`146`) | `Y` | Planeta Yuri (solo) | `warn 119,3 .. done 157,2` (`t` GRAVIDADE na `col 126`) |
| 6 | c.20 col 5 (`233`) | `u` | OVNI Patrulheiro | `213,5 .. 228,4` (após grace de `K` #1 `200,5 .. 211,3`) |
| 7 | c.21 col 11 (`251`) | `a` | Alien de Jetpack | `231,5 .. 258,7` |
| 8 | c.24 col 10 (`286`) | `g` | Cometa de Gelo | `warn 262,3 .. done 278,1` |
| 9 | c.26 col 8 (`308`) | `U` | Planeta Yumi (limpo) | `warn 281,3 .. done 319,2` |
| 10 | c.35 col 4 (`412`) | `b` | Mina Orbital Magnética | `392,5 .. 412,9` (após grace de `K` #2 `380,5 .. 391,3`) |
| 11 | c.37 col 1 (`433`) | `S` | Satélite de Varredura | `413,5 .. 434,1` |
| 12 | c.38 col 11 (`455`) | `v` | Rajada de Vento Solar | `435,5 .. 449,9` |

---

## 6. Partitura compasso a compasso (65 compassos)

Notação por tempo (`1`–`4`, 3 colunas cada). `·` = vazio. Moedas `c` indicam trilhas em `(linha)` ou `(arco)`/`(estilingue)`.

### Embarque (c.1–4)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 1 | · | P | c | t+c | Spawn `P` (col 4, l.5); `t` `MOVA 2D` (col 9, l.2); linha inicial de moedas |
| 2 | t | c | c | · | `t` `IMPULSO` (col 14, l.2); moedas na linha 4 (1,8 s iniciais livres) |
| 3 | c | c | m | · | **Estreia `m`** (col 31, l.5) isolada após o grace inicial |
| 4 | c | c | · | m | Moedas baixas pós-meteoro + `m` #2 no fim do compasso (col 47, l.4) |

### Ato 1 — Cinturão de Sucata (c.5–17)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 5 | c | c | · | · | Transição de moedas antes da estreia de `M` |
| 6 | c | c | · | M | **Estreia `M`** (col 69, l.5, aviso 0,5 s na borda) |
| 7 | c | c | · | s | **Estreia `s`** (col 81, l.5); moedas por baixo |
| 8 | c | c | · | · | Respiro com moedas altas |
| 9 | · | d+c | c | · | **Estreia `d`** (col 100, l.5); moedas por cima |
| 10 | c | c | · | m | Combo leve `m` #3 (col 118, l.7) após saída de `d` |
| 11 | c | c | t | · | `t` `GRAVIDADE` (col 126, l.2) antes do 1º Yuri |
| 12 | c | c | · | · | Corredor limpo preparando a chegada de Yuri |
| 13 | Y | c | c | · | **Estreia `Y` #1 solo** (col 146, `y=52`); moedas no corredor inferior |
| 14 | c | c | · | · | Passagem limpa sob `Y` #1 |
| 15 | c | · | · | m | `m` #4 (col 178, l.5) entre `Y` #1 e `Y` #2 |
| 16 | · | · | Y | c | **`Y` #2** (col 186, `y=132`) + início do arco de estilingue (`d ≈ 60–76 px`) |
| 17 | c | c | M | · | Fecho do arco de moedas + `M` #2 alto (col 198, l.3) no corredor livre |

### Checkpoint 1 (c.18)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 18 | K | c | W | c | Checkpoint 1 (`K` col 204); cápsula `W` #1 (col 210); 1,8 s livres após `K` |

### Ato 2 — Fronteira dos Aliens (c.19–32)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 19 | c | c | · | · | Respiro de segurança pós-CP1 (sem ameaças) |
| 20 | · | u | c | c | **Estreia `u`** (col 233, l.5, senoide + plasma) |
| 21 | c | c | · | a | **Estreia `a`** (col 251, l.4, persegue Y e avança) |
| 22 | · | c | c | · | Respiro acompanhando esquiva do alien |
| 23 | c | c | · | · | Janela limpa para o telegraph do cometa |
| 24 | c | c | · | g | **Estreia `g`** (col 286, l.1 → desce em 45° com trilha de aviso) |
| 25 | · | c | c | · | Aproximação limpa da estreia de Yumi |
| 26 | · | · | U+c | c | **Estreia `U` #1 limpo** (col 308, `y=130`) |
| 27 | c | c | · | · | Arco de moedas de estilingue acima de `U` #1 |
| 28 | · | W | c | · | `W` #2 (col 328) + saída limpa de `U` #1 |
| 29 | · | u | s | d+c | Combo `u` #2 (col 339, l.7) + `s` #2 (col 342, l.3) + `d` #2 (col 345, l.7) |
| 30 | · | M | c | · | `M` #3 alto (col 352, l.3) antes do aviso de `Y` #3 |
| 31 | · | Y+c | c | m | **`Y` #3** (col 364, `y=50`) + `m` #5 baixo fora do crítico (col 371, l.9) |
| 32 | g | c | · | · | `g` #2 ascendente (col 374, l.9) na saída de `Y` #3 antes de CP2 |

### Checkpoint 2 (c.33)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 33 | K | c | W | c | Checkpoint 2 (`K` col 384); cápsula `W` #3 (col 390) |

### Ato 3 — Corredor Gravitacional (c.34–48)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 34 | c | c | · | · | Respiro de segurança pós-CP2 (sem ameaças) |
| 35 | · | b | c | c | **Estreia `b`** (col 412, l.5, mina desarmada/armada) |
| 36 | c | c | · | · | Respiro após mina |
| 37 | S | c | c | · | **Estreia `S`** (col 433, l.1, satélite de varredura superior) |
| 38 | c | c | · | v | **Estreia `v`** (col 455, l.5, rajada de vento solar telegrafada 1,0 s) |
| 39 | · | · | W | · | `W` #4 (col 464, l.3) preparando `U` #2 |
| 40 | · | · | c | U+c | **`U` #2** (col 478, `y=136`) |
| 41 | c | c | b | · | Moedas no corredor seguro superior de `U` #2 + mina `b` #2 (col 486, l.3) |
| 42 | · | m+c | c | · | `m` #6 (col 496, l.4) antes do planeta em onda |
| 43 | a | c | c | · | `a` #2 (col 506, l.7) preparando corredor inferior para `Y` #4 |
| 44 | Y+c | c | · | · | **`Y` #4 (`wave: true`)** (col 516, `y=46 ± 16`); moedas embaixo |
| 45 | c | m | · | · | `m` #7 (col 532, l.7) na transição antes do par escalonado em "S" |
| 46 | · | · | U+c | c | **Par em "S" — parte 1: `U` #3** (col 548, `y=46`) |
| 47 | · | c | c | Y+c | **Par em "S" — parte 2: `Y` #5** (col 561, `y=136`); moedas guiando subida |
| 48 | c | c | · | · | Saída limpa antes de CP3 |

### Checkpoint 3 (c.49)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 49 | K | c | W | c | Checkpoint 3 (`K` col 576); cápsula `W` #5 (col 582) |

### Ato 4 — Escolta da Nave-Mãe (c.50–61)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 50 | c | c | · | N | Respiro pós-CP3 + chegada da **Nave-Mãe `N`** (col 599, fim do c.50) |
| 51 | c | S+Onda | · | · | `S` #2 inferior (col 604, l.9) + **Onda 1** (`meteor_fire`, `y=50`) |
| 52 | Onda | b | Onda+c | · | **Onda 2** (`ufo`, `y=58`) + mina `b` #3 (col 616) + **Onda 3** (`plasma_orb`, `y=120`) |
| 53 | d+Onda | c | · | v | `d` #3 (col 626, l.7) + **Onda 4** (`plasma_orb`, `y=54`) + `v` #2 alto (col 634, l.3) |
| 54 | a | c | c | · | `a` #3 (col 638, l.7) + transição para Yuri final |
| 55 | Y | c | Onda+c | · | **`Y` #6** (col 650, `y=48`), corredor inferior limpo + **Onda 5** (`plasma_orb`, `y=126`) |
| 56 | c | Onda | m | · | **Onda 6** (`meteor_fire`, `y=54`) + `m` #8 (col 668, l.7) após saída de `Y` #6 |
| 57 | c | Onda | · | s | **Onda 7** (`ufo`, `y=128`) + satélite `s` #3 (col 681, l.5) entre planetas finais |
| 58 | Onda+c | g | · | u | **Onda 8** (`plasma_orb`, `y=130`) + cometa `g` #3 (col 688, l.9) + `u` #3 (col 693, l.4) |
| 59 | Onda | · | c | U+c | **Onda 9** (`meteor_fire`, `y=48`) + **`U` #4 (`wave: true`)** (col 706, `y=132 ± 16`) |
| 60 | c | c | · | · | Arco alto de estilingue acima de `U` #4 |
| 61 | c | · | W | c | `W` #6 (col 726, l.5); encerramento da escolta |

### Final — Acoplagem EEIQ (c.62–65)

| C. | 1 | 2 | 3 | 4 | Nota |
|---|---|---|---|---|---|
| 62 | c | c | c | · | Nave-Mãe recua; início da desaceleração; zero ameaças |
| 63 | c | c | c | · | Desaceleração suave até a EEIQ |
| 64 | · | c | · | · | Rolagem para em `SPACE_STOP_CAM_X` (EEIQ à vista) |
| 65 | · | · | A | · | **Doca EEIQ `A`** (col 774, l.5) — cutscene do Sachê de Água |
