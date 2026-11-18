import type { Entity, Level, LevelTheme, TileId, Vec2, World } from '../core/types';
import { Tile } from '../core/types';
import { PLAYER_H, PLAYER_W, TILE, VIEW_H, VIEW_W } from '../core/constants';
import { SPRITE_SPEC } from '../gfx/spec';
import { createEnemy } from './enemies';
import {
  createAlienGoal, createCoin, createCrumblePlatform, createDrop, createMovingPlatform, createMug, createPopCoin,
  createVineWater, createWaterCactus,
} from './objects';
import { LEVEL1_MOVERS, LEVEL1_ROWS } from './level1';
import { LEVEL2_MOVERS, LEVEL2_ROWS } from './level2';
import { LEVEL3_ROWS } from './level3';
import { LEVEL4_MOVERS, LEVEL4_ROWS } from './level4';
import { createSeaEnemy } from './enemies3';
import { createAirVent, createGoldfishSchool, createJandira, createRibbon, createStaffGoal } from './objects3';
import { createRioEnemy } from './enemies4';
import { createAmaroGoal, createClayFilter } from './objects4';
import { LEVEL5_MOVERS, LEVEL5_ROWS } from './level5';
import { createSampaEnemy } from './enemies5';
import { createBebedouro, createMaiaGoal } from './objects5';

type SpriteName = keyof typeof SPRITE_SPEC;

export interface Marker { ch: string; col: number; row: number }

/** Contexto passado ao handler de marcadores (posição da célula em px + parâmetros de movers). */
export interface MarkerCtx {
  /** canto sup. esq. da célula */
  left: number;
  top: number;
  /** centro horizontal da célula */
  cx: number;
  /** parâmetros de plataforma móvel desta célula (ou padrão) */
  mover: { range: number; speed: number };
}

/** Descrição de dados de uma fase para `buildLevel`. */
export interface LevelDef {
  index: number;
  name: string;
  theme: LevelTheme;
  /** fase subaquática (física de nado + oxigênio) */
  underwater?: boolean;
  rows: string[];
  movers: Record<string, { range: number; speed: number }>;
  /** caractere → tile */
  tileChars: Record<string, TileId>;
  /** caracteres de BlockItem que soltam gota (em vez de moeda) */
  dropBlockChars: string;
  /** caractere → sprite de decoração (base na base da célula, alinhado à esquerda) */
  decor: Record<string, SpriteName>;
  /** caracteres de decoração centralizados horizontalmente na célula */
  decorCentered?: string;
  /** sprite de cada tile (Water é tratado à parte: tile_water_top / tile_water) */
  tileSprites: Partial<Record<TileId, SpriteName>>;
  /** tiles com 2 variações (frame escolhido por hash da posição) */
  tileVariants: TileId[];
  /**
   * Opcional: nº de frames do sprite de Rock escolhido por SEQUÊNCIA horizontal contígua de Rock
   * (hash da coluna inicial da sequência naquela linha), em vez do hash por célula. Num retângulo de
   * Rock (baú de caminhão) todas as linhas começam na mesma coluna → cor uniforme. Sem isso: comportamento antigo.
   */
  rockRunFrames?: number;
  /** linha (tile) do chão da fase: topo máximo da sombra de abismo (padrão 11) */
  groundRow?: number;
  /** borda desenhada no topo de Rock exposto (sem sólido acima): [linha clara, linha de musgo] */
  rockEdge?: [string, string];
  /** contorno (1px) nas laterais/base expostas do terreno sólido: destaca o primeiro plano do cenário */
  terrainOutline?: string;
  /** cores da sombra de abismo [borda, meio, fundo] */
  pitColors: [string, string, string];
  /** cores da bandeira de checkpoint [não alcançado, alcançado] */
  flagColors: [string, string];
  /** cria a entidade de um marcador (P/K já são tratados); null = ignora */
  marker(ch: string, m: MarkerCtx): Entity | null;
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Constrói um Level genérico a partir de dados. */
export function buildLevel(def: LevelDef): Level {
  const rowsSrc = def.rows;
  const rows = rowsSrc.length;
  const cols = rowsSrc[0]?.length ?? 0;
  const grid = new Uint8Array(cols * rows);
  const original = new Uint8Array(cols * rows);
  const waterBlocks = new Set<number>(); // índices de BlockItem que soltam gota
  const markers: Marker[] = [];
  const decor: Marker[] = [];
  const centered = def.decorCentered ?? '';

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = rowsSrc[y]?.[x] ?? '.';
      const t = def.tileChars[ch];
      if (t !== undefined) {
        original[y * cols + x] = t;
        if (def.dropBlockChars.includes(ch)) waterBlocks.add(y * cols + x);
      } else if (ch in def.decor) decor.push({ ch, col: x, row: y });
      else if (ch !== '.') markers.push({ ch, col: x, row: y });
    }
  }
  grid.set(original);

  const spawnM = markers.find((m) => m.ch === 'P');
  const footPos = (m: Marker): Vec2 => ({ x: m.col * TILE + (TILE - PLAYER_W) / 2, y: (m.row + 1) * TILE - PLAYER_H });
  const playerSpawn: Vec2 = spawnM ? footPos(spawnM) : { x: 16, y: 10 * TILE };
  const cps = markers.filter((m) => m.ch === 'K').sort((a, b) => a.col - b.col).map(footPos);

  const tileAt = (tx: number, ty: number): TileId => {
    if (tx < 0 || tx >= cols) return Tile.Rock;
    if (ty < 0 || ty >= rows) return Tile.Empty;
    return grid[ty * cols + tx] as TileId;
  };
  const isSolid = (tx: number, ty: number): boolean => {
    const t = tileAt(tx, ty);
    return t === Tile.GroundTop || t === Tile.Ground || t === Tile.Rock || t === Tile.Block || t === Tile.BlockItem;
  };
  const isOpen = (t: number): boolean => t === Tile.Empty || t === Tile.Spike;

  // colunas com água a partir da linha do chão: sem sombra de abismo
  const waterCol = new Uint8Array(cols);
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) if (original[y * cols + x] === Tile.Water) { waterCol[x] = 1; break; }
  }

  // frame de Rock por sequência horizontal contígua (Rock é indestrutível: calcula uma vez do original)
  const rockRunFrames = def.rockRunFrames ?? 0;
  const rockFrame = rockRunFrames > 0 ? new Uint8Array(cols * rows) : null;
  if (rockFrame) {
    for (let y = 0; y < rows; y++) {
      let start = -1;
      for (let x = 0; x < cols; x++) {
        if (original[y * cols + x] !== Tile.Rock) { start = -1; continue; }
        if (start < 0) start = x;
        rockFrame[y * cols + x] = hash(start, 0) % rockRunFrames;
      }
    }
  }

  const groundRow = def.groundRow ?? 11;
  const [pitEdge, pitMid, pitDeep] = def.pitColors;
  const [flagOff, flagOn] = def.flagColors;

  const level: Level = {
    index: def.index,
    name: def.name,
    theme: def.theme,
    underwater: def.underwater ?? false,
    cols,
    rows,
    widthPx: cols * TILE,
    heightPx: rows * TILE,
    playerSpawn,
    checkpoints: cps,
    tileAt,
    setTile(tx, ty, t) {
      if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) return;
      grid[ty * cols + tx] = t;
    },
    isSolid,
    isOneWay: (tx, ty) => tileAt(tx, ty) === Tile.OneWay,
    isHazard: (tx, ty) => {
      const t = tileAt(tx, ty);
      return t === Tile.Spike || t === Tile.Water;
    },
    punchTile(tx, ty, world) {
      const t = tileAt(tx, ty);
      if (t !== Tile.Block && t !== Tile.BlockItem) return false;
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
      grid[ty * cols + tx] = Tile.Empty;
      world.fx('debris', cx, cy, 1);
      world.fx('debris', cx, cy, -1);
      world.audio.play('break');
      world.addScore(50, cx, ty * TILE);
      world.shake(1.5, 0.12);
      if (t === Tile.BlockItem) {
        if (waterBlocks.has(ty * cols + tx)) world.spawn(createDrop(cx, cy, 0, -150));
        else world.spawn(createPopCoin(cx - 4, ty * TILE + 4));
      }
      return true;
    },
    reset() { grid.set(original); },
    createEntities() {
      const out: Entity[] = [];
      for (const m of markers) {
        if (m.ch === 'P' || m.ch === 'K') continue;
        const left = m.col * TILE, top = m.row * TILE;
        const mover = def.movers[`${m.col},${m.row}`] ?? { range: 4, speed: 30 };
        const e = def.marker(m.ch, { left, top, cx: left + TILE / 2, mover });
        if (e) out.push(e);
      }
      return out;
    },
    draw(ctx, world: World) {
      const camX = world.camera.x, camY = world.camera.y;
      const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(cols - 1, Math.floor((camX + VIEW_W) / TILE));
      const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(rows - 1, Math.floor((camY + VIEW_H) / TILE));
      const sp = world.sprites;

      // sombra dos abismos: colunas sem chão até a base ficam escuras (senão o chão do
      // parallax faz o buraco parecer chão). Nunca em colunas de água.
      const pitTop = groundRow * TILE;
      for (let tx = x0; tx <= x1; tx++) {
        if (waterCol[tx]) continue;
        if (!isOpen(grid[(rows - 1) * cols + tx] ?? 0)) continue;
        // topo da sombra = primeira linha vazia contínua acima da base, limitada à linha do chão
        let top = rows - 1;
        while (top > groundRow && isOpen(grid[(top - 1) * cols + tx] ?? 0)) top--;
        const y = Math.max(pitTop, top * TILE);
        ctx.fillStyle = pitEdge;
        ctx.fillRect(tx * TILE, y, TILE, 6);
        ctx.fillStyle = pitMid;
        ctx.fillRect(tx * TILE, y + 6, TILE, 10);
        ctx.fillStyle = pitDeep;
        ctx.fillRect(tx * TILE, y + 16, TILE, rows * TILE - y - 16);
      }
      // decoração (atrás dos tiles), ancorada pela base da célula
      for (const d of decor) {
        const name = def.decor[d.ch];
        if (!name) continue;
        const [w, h] = SPRITE_SPEC[name];
        const px = d.col * TILE + (centered.includes(d.ch) ? (TILE - w) / 2 : 0);
        if (px + w < camX || px > camX + VIEW_W) continue;
        sp.draw(ctx, name, 0, px, (d.row + 1) * TILE - h);
      }
      // checkpoints
      for (const cp of cps) {
        const cx = cp.x + PLAYER_W / 2, by = cp.y + PLAYER_H;
        if (cx < camX - 16 || cx > camX + VIEW_W + 16) continue;
        const reached = world.player.x >= cp.x - 4;
        ctx.fillStyle = '#6b4a2b';
        ctx.fillRect(Math.round(cx) - 1, by - 24, 2, 24);
        ctx.fillStyle = '#3a2a18';
        ctx.fillRect(Math.round(cx) - 2, by - 2, 4, 2);
        const wave = reached ? Math.round(Math.sin(world.time * 6)) : 0;
        ctx.fillStyle = reached ? flagOn : flagOff;
        ctx.fillRect(Math.round(cx) + 1, by - 24, 8, 3);
        ctx.fillRect(Math.round(cx) + 1, by - 21, 6 + wave, 3);
        ctx.fillRect(Math.round(cx) + 1, by - 18, 4 + wave, 2);
      }
      // tiles
      const time = world.time;
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const t = grid[ty * cols + tx] as TileId;
          if (t === Tile.Empty) continue;
          const px = tx * TILE, py = ty * TILE;
          if (t === Tile.Water) {
            const surface = ty === 0 || grid[(ty - 1) * cols + tx] !== Tile.Water;
            if (surface) sp.draw(ctx, 'tile_water_top', Math.floor(time * 6 + tx * 0.5) & 3, px, py);
            else sp.draw(ctx, 'tile_water', Math.floor(time * 3 + (tx + ty) * 0.5) & 1, px, py);
            continue;
          }
          const name = def.tileSprites[t];
          if (!name) continue;
          const f = t === Tile.Rock && rockFrame
            ? rockFrame[ty * cols + tx] ?? 0
            : def.tileVariants.includes(t) ? hash(tx, ty) & 1 : 0;
          sp.draw(ctx, name, f, px, py);
          if (t === Tile.Rock && def.rockEdge && ty > 0 && !isSolid(tx, ty - 1)) {
            ctx.fillStyle = def.rockEdge[0];
            ctx.fillRect(px, py, TILE, 1);
            ctx.fillStyle = def.rockEdge[1];
            ctx.fillRect(px, py + 1, TILE, 1);
          }
          if (def.terrainOutline && (t === Tile.Ground || t === Tile.GroundTop || t === Tile.Rock)) {
            ctx.fillStyle = def.terrainOutline;
            if (tx > 0 && !isSolid(tx - 1, ty)) ctx.fillRect(px, py, 1, TILE);
            if (tx < cols - 1 && !isSolid(tx + 1, ty)) ctx.fillRect(px + TILE - 1, py, 1, TILE);
            if (ty < rows - 1 && !isSolid(tx, ty + 1)) ctx.fillRect(px, py + TILE - 1, TILE, 1);
          }
        }
      }
    },
  };
  return level;
}

// ── Fase 1 — Trilha dos Monólitos (sertão) ───────────────────────────────────
export function createLevel1(): Level {
  return buildLevel({
    index: 0,
    name: 'TRILHA DOS MONÓLITOS',
    theme: 'sertao',
    rows: LEVEL1_ROWS,
    movers: LEVEL1_MOVERS,
    tileChars: {
      '=': Tile.GroundTop, '#': Tile.Ground, 'R': Tile.Rock, '^': Tile.Spike,
      'B': Tile.Block, '?': Tile.BlockItem, 'W': Tile.BlockItem, '-': Tile.OneWay,
    },
    dropBlockChars: 'W',
    decor: {
      s: 'sign', k: 'skull', f: 'fence', T: 'deadtree', b: 'bush', o: 'pebbles', j: 'mandacaru', H: 'chapel', D: 'pedestal',
    },
    decorCentered: 'o',
    tileSprites: {
      [Tile.GroundTop]: 'tile_ground_top', [Tile.Ground]: 'tile_ground', [Tile.Rock]: 'tile_rock',
      [Tile.Spike]: 'tile_spike', [Tile.Block]: 'tile_block', [Tile.BlockItem]: 'tile_block_item',
      [Tile.OneWay]: 'tile_oneway',
    },
    tileVariants: [Tile.GroundTop, Tile.Ground, Tile.Rock],
    pitColors: ['#7a3418', '#4a2416', '#2a1620'],
    flagColors: ['#c9c1a9', '#4fc65a'],
    marker(ch, { left, top, cx, mover }) {
      switch (ch) {
        case 'c': return createCoin(left + 4, top + 4);
        case 'l': return createEnemy('calango', cx, top + TILE);
        case 'p': return createEnemy('palma', cx, top + TILE);
        case 't': return createEnemy('tatu', cx, top + TILE);
        case 'v': return createEnemy('carcara', cx, top + TILE / 2);
        case 'C': return createWaterCactus(cx - 12, top + TILE - 32);
        case 'd': return createCrumblePlatform(left, top);
        case 'm':
        case 'M': return createMovingPlatform(left, top, ch === 'm' ? 'x' : 'y', mover.range * TILE, mover.speed);
        case 'G': return createMug(left, top + TILE - 14);
        default: return null;
      }
    },
  });
}

// ── Fase 2 — Coração da Amazônia ─────────────────────────────────────────────
export function createLevel2(): Level {
  return buildLevel({
    index: 1,
    name: 'CORAÇÃO DA AMAZÔNIA',
    theme: 'amazonia',
    rows: LEVEL2_ROWS,
    movers: LEVEL2_MOVERS,
    tileChars: {
      '=': Tile.GroundTop, '#': Tile.Ground, 'R': Tile.Rock, '^': Tile.Spike,
      'B': Tile.Block, '?': Tile.BlockItem, 'W': Tile.BlockItem, '-': Tile.OneWay, '~': Tile.Water,
    },
    dropBlockChars: 'W',
    decor: {
      s: 'jsign', O: 'oca', h: 'heliconia', f: 'fern', F: 'bamboo_fence', q: 'canoe', t: 'totem',
    },
    tileSprites: {
      [Tile.GroundTop]: 'tile_jg_top', [Tile.Ground]: 'tile_jg_ground', [Tile.Rock]: 'tile_jg_rock',
      [Tile.Spike]: 'tile_jg_spike', [Tile.Block]: 'tile_jg_block', [Tile.BlockItem]: 'tile_jg_block_item',
      [Tile.OneWay]: 'tile_jg_oneway',
    },
    tileVariants: [Tile.GroundTop, Tile.Ground, Tile.Rock],
    pitColors: ['#5a2414', '#3a160e', '#200c0a'],
    flagColors: ['#c9c1a9', '#ffd23f'],
    marker(ch, { left, top, cx, mover }) {
      switch (ch) {
        case 'c': return createCoin(left + 4, top + 4);
        case 'o': return createEnemy('onca', cx, top + TILE);
        case 'j': return createEnemy('jacare', cx, top + TILE);
        case 'n': return createEnemy('cobra', cx, top + TILE);
        // +12px: com a câmera embaixo, a linha 3 fica atrás da faixa do HUD; assim o tucano paira logo abaixo dela
        case 'u': return createEnemy('tucano', cx, top + TILE / 2 + 12);
        case 'V': return createVineWater(left, top + TILE - 32);
        case 'd': return createCrumblePlatform(left, top, 'platform_lily');
        case 'm':
        case 'M':
          return createMovingPlatform(left, top, ch === 'm' ? 'x' : 'y', mover.range * TILE, mover.speed, 'platform_log');
        case 'A': return createAlienGoal(cx, top + TILE);
        default: return null;
      }
    },
  });
}

// ── Fase 3 — Bahia World (subaquática) ───────────────────────────────────────
export function createLevel3(): Level {
  return buildLevel({
    index: 2,
    name: 'BAHIA WORLD',
    theme: 'bahia',
    underwater: true,
    groundRow: 15,
    rockEdge: ['#9fe0ff', '#3d8a2a'],
    rows: LEVEL3_ROWS,
    movers: {},
    tileChars: {
      '=': Tile.GroundTop, '#': Tile.Ground, 'R': Tile.Rock, '^': Tile.Spike,
      'B': Tile.Block, '?': Tile.BlockItem, 'W': Tile.BlockItem, '-': Tile.OneWay,
    },
    dropBlockChars: 'W',
    decor: {
      '1': 'coral_pink', '2': 'coral_fan', '3': 'seaweed', '4': 'anchor', '5': 'ruin_column', '6': 'ruin_arch',
      '7': 'shell', '8': 'bsign', '9': 'bonfim_rock', '0': 'amphora',
    },
    tileSprites: {
      [Tile.GroundTop]: 'tile_bh_top', [Tile.Ground]: 'tile_bh_ground', [Tile.Rock]: 'tile_bh_rock',
      [Tile.Spike]: 'tile_bh_spike', [Tile.Block]: 'tile_bh_block', [Tile.BlockItem]: 'tile_bh_block_item',
      [Tile.OneWay]: 'tile_bh_oneway',
    },
    tileVariants: [Tile.GroundTop, Tile.Ground, Tile.Rock],
    pitColors: ['#0d3b66', '#0a2c4e', '#061a30'],
    flagColors: ['#c9c1a9', '#ef476f'],
    marker(ch, { left, top, cx }) {
      const cy = top + TILE / 2, foot = top + TILE;
      switch (ch) {
        case 'c': return createCoin(left + 4, top + 4);
        case 'a': return createSeaEnemy('agua_viva', cx, cy);
        case 'g': return createSeaEnemy('peixe_agulha', cx, cy);
        case 'b': return createSeaEnemy('baiacu', cx, cy);
        case 'D': return createSeaEnemy('dentao', cx, cy);
        case 's': return createSeaEnemy('siri', cx, foot);
        case 'T': return createSeaEnemy('tartaruga', cx, cy);
        case 'e': return createSeaEnemy('moreia', cx, cy);
        case 'v': return createAirVent(cx, foot);
        case 'f': return createRibbon(cx, cy);
        case 'p': return createGoldfishSchool(cx, cy);
        case 'S': return createStaffGoal(cx, foot);
        case 'J': return createJandira(cx, foot);
        default: return null;
      }
    },
  });
}

// ── Fase 4 — Favela do Rio (Do Morro ao Tribunal) ───────────────────────────
export function createLevel4(): Level {
  return buildLevel({
    index: 3,
    name: 'FAVELA DO RIO',
    theme: 'rio',
    rows: LEVEL4_ROWS,
    movers: LEVEL4_MOVERS,
    tileChars: {
      '=': Tile.GroundTop, '#': Tile.Ground, 'R': Tile.Rock, '^': Tile.Spike,
      'B': Tile.Block, '?': Tile.BlockItem, 'W': Tile.BlockItem, '-': Tile.OneWay, '~': Tile.Water,
    },
    dropBlockChars: 'W',
    decor: {
      s: 'rsign', T: 'tribunal_facade', x: 'water_tank', p: 'utility_pole',
      v: 'clothesline', F: 'party_speaker', b: 'mop_bucket',
    },
    tileSprites: {
      [Tile.GroundTop]: 'tile_rj_top', [Tile.Ground]: 'tile_rj_ground', [Tile.Rock]: 'tile_rj_rock',
      [Tile.Spike]: 'tile_rj_spike', [Tile.Block]: 'tile_rj_block', [Tile.BlockItem]: 'tile_rj_block_item',
      [Tile.OneWay]: 'tile_rj_oneway',
    },
    tileVariants: [Tile.GroundTop, Tile.Ground, Tile.Rock],
    terrainOutline: '#1a1423',
    pitColors: ['#2d2c52', '#211f3a', '#141024'],
    flagColors: ['#c9c1a9', '#2ec4b6'],
    marker(ch, { left, top, cx, mover }) {
      switch (ch) {
        case 'c': return createCoin(left + 4, top + 4);
        case 'l': return createRioEnemy('caramelo', cx, top + TILE);
        case 'u': return createRioEnemy('pombo', cx, top + TILE / 2 + 12);
        case 'g': return createRioEnemy('gato', cx, top + TILE);
        case 'o': return createRioEnemy('capivara', cx, top + TILE);
        case 'z': return createRioEnemy('traficante', cx, top + TILE);
        case 'V': return createClayFilter(left, top + TILE - 32);
        case 'd': return createCrumblePlatform(left, top, 'platform_zinc');
        case 'm':
        case 'M':
          return createMovingPlatform(left, top, ch === 'm' ? 'x' : 'y', mover.range * TILE, mover.speed, 'platform_scaffold');
        case 'A': return createAmaroGoal(cx, top + TILE);
        default: return null;
      }
    },
  });
}

// ── Fase 5 — Transportadora de São Paulo (Hora do Café) ─────────────────────
export function createLevel5(): Level {
  return buildLevel({
    index: 4,
    name: 'TRANSPORTADORA DE SÃO PAULO',
    theme: 'sampa',
    rows: LEVEL5_ROWS,
    movers: LEVEL5_MOVERS,
    tileChars: {
      '=': Tile.GroundTop, '#': Tile.Ground, 'R': Tile.Rock, '^': Tile.Spike,
      'B': Tile.Block, '?': Tile.BlockItem, 'W': Tile.BlockItem, '-': Tile.OneWay,
    },
    dropBlockChars: 'W',
    decor: {
      t: 'truck_cab', w: 'truck_wheels', n: 'cone', s: 'dock_sign', f: 'forklift_sign', h: 'hand_truck',
      o: 'oil_drum', G: 'guarita', q: 'time_clock', C: 'coffee_machine',
    },
    decorCentered: 'n',
    tileSprites: {
      [Tile.GroundTop]: 'tile_sp_top', [Tile.Ground]: 'tile_sp_ground', [Tile.Rock]: 'tile_sp_rock',
      [Tile.Spike]: 'tile_sp_spike', [Tile.Block]: 'tile_sp_block', [Tile.BlockItem]: 'tile_sp_block_item',
      [Tile.OneWay]: 'tile_sp_oneway',
    },
    // GroundTop/Ground: 2 variações por hash; Rock: cor do baú (branco/azul/laranja) uniforme por caminhão
    tileVariants: [Tile.GroundTop, Tile.Ground],
    rockRunFrames: 3,
    terrainOutline: '#14161f',
    // fosso de doca: concreto frio de madrugada
    pitColors: ['#3b4157', '#252a3b', '#12141d'],
    flagColors: ['#c9c1a9', '#ff9f1c'],
    marker(ch, { left, top, cx, mover }) {
      switch (ch) {
        case 'c': return createCoin(left + 4, top + 4);
        case 'r': return createSampaEnemy('rato', cx, top + TILE);
        case 'g': return createSampaEnemy('carregador', cx, top + TILE);
        case 'e': return createSampaEnemy('empilhadeira', cx, top + TILE);
        case 'a': return createSampaEnemy('arremessador', cx, top + TILE);
        case 'V': return createBebedouro(left, top + TILE - 32);
        case 'd': return createCrumblePlatform(left, top, 'platform_crates');
        case 'm':
        case 'M':
          return createMovingPlatform(left, top, ch === 'm' ? 'x' : 'y', mover.range * TILE, mover.speed, 'platform_dock');
        case 'A': return createMaiaGoal(cx, top + TILE);
        default: return null;
      }
    },
  });
}
