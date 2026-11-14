import type { Entity, Level, TileId, Vec2, World } from '../core/types';
import { Tile } from '../core/types';
import { PLAYER_H, PLAYER_W, TILE, VIEW_H, VIEW_W } from '../core/constants';
import { SPRITE_SPEC } from '../gfx/spec';
import { createEnemy } from './enemies';
import {
  createCoin, createCrumblePlatform, createDrop, createMovingPlatform, createMug, createPopCoin, createWaterCactus,
} from './objects';
import { LEVEL1_MOVERS, LEVEL1_ROWS } from './level1';

const TILE_CHARS: Record<string, TileId> = {
  '=': Tile.GroundTop, '#': Tile.Ground, 'R': Tile.Rock, '^': Tile.Spike,
  'B': Tile.Block, '?': Tile.BlockItem, 'W': Tile.BlockItem, '-': Tile.OneWay,
};

const DECOR_SPRITE: Record<string, keyof typeof SPRITE_SPEC> = {
  s: 'sign', k: 'skull', f: 'fence', T: 'deadtree', b: 'bush', o: 'pebbles', j: 'mandacaru', H: 'chapel', D: 'pedestal',
};

interface Marker { ch: string; col: number; row: number }

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

export function createLevel1(): Level {
  const rowsSrc = LEVEL1_ROWS;
  const rows = rowsSrc.length;
  const cols = rowsSrc[0].length;
  const grid = new Uint8Array(cols * rows);
  const original = new Uint8Array(cols * rows);
  const waterBlocks = new Set<number>(); // índices de BlockItem que soltam gota
  const markers: Marker[] = [];
  const decor: Marker[] = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const ch = rowsSrc[y][x];
      const t = TILE_CHARS[ch];
      if (t !== undefined) {
        original[y * cols + x] = t;
        if (ch === 'W') waterBlocks.add(y * cols + x);
      } else if (ch in DECOR_SPRITE) decor.push({ ch, col: x, row: y });
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

  const level: Level = {
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
    isHazard: (tx, ty) => tileAt(tx, ty) === Tile.Spike,
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
        const left = m.col * TILE, top = m.row * TILE, cx = left + TILE / 2;
        switch (m.ch) {
          case 'c': out.push(createCoin(left + 4, top + 4)); break;
          case 'l': out.push(createEnemy('calango', cx, top + TILE)); break;
          case 'p': out.push(createEnemy('palma', cx, top + TILE)); break;
          case 't': out.push(createEnemy('tatu', cx, top + TILE)); break;
          case 'v': out.push(createEnemy('carcara', cx, top + TILE / 2)); break;
          case 'C': out.push(createWaterCactus(cx - 12, top + TILE - 32)); break;
          case 'd': out.push(createCrumblePlatform(left, top)); break;
          case 'm':
          case 'M': {
            const p = LEVEL1_MOVERS[`${m.col},${m.row}`] ?? { range: 4, speed: 30 };
            out.push(createMovingPlatform(left, top, m.ch === 'm' ? 'x' : 'y', p.range * TILE, p.speed));
            break;
          }
          case 'G': out.push(createMug(left, top + TILE - 14)); break;
          default: break;
        }
      }
      return out;
    },
    draw(ctx, world: World) {
      const camX = world.camera.x, camY = world.camera.y;
      const x0 = Math.max(0, Math.floor(camX / TILE)), x1 = Math.min(cols - 1, Math.floor((camX + VIEW_W) / TILE));
      const y0 = Math.max(0, Math.floor(camY / TILE)), y1 = Math.min(rows - 1, Math.floor((camY + VIEW_H) / TILE));
      const sp = world.sprites;

      // sombra dos abismos: colunas sem chão até a base ficam escuras (senão a areia do
      // parallax faz o buraco parecer chão)
      const pitTop = 11 * TILE;
      for (let tx = x0; tx <= x1; tx++) {
        const bottom = grid[(rows - 1) * cols + tx];
        if (bottom !== Tile.Empty && bottom !== Tile.Spike) continue;
        // topo da sombra = primeira linha vazia contínua acima da base, limitada à linha do chão
        let top = rows - 1;
        while (top > 11 && (grid[(top - 1) * cols + tx] === Tile.Empty || grid[(top - 1) * cols + tx] === Tile.Spike)) top--;
        const y = Math.max(pitTop, top * TILE);
        ctx.fillStyle = '#7a3418';
        ctx.fillRect(tx * TILE, y, TILE, 6);
        ctx.fillStyle = '#4a2416';
        ctx.fillRect(tx * TILE, y + 6, TILE, 10);
        ctx.fillStyle = '#2a1620';
        ctx.fillRect(tx * TILE, y + 16, TILE, rows * TILE - y - 16);
      }
      // decoração (atrás dos tiles), ancorada pela base da célula
      for (const d of decor) {
        const name = DECOR_SPRITE[d.ch];
        const [w, h] = SPRITE_SPEC[name];
        const px = d.col * TILE + (d.ch === 'o' ? (TILE - w) / 2 : 0);
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
        ctx.fillStyle = reached ? '#4fc65a' : '#c9c1a9';
        ctx.fillRect(Math.round(cx) + 1, by - 24, 8, 3);
        ctx.fillRect(Math.round(cx) + 1, by - 21, 6 + wave, 3);
        ctx.fillRect(Math.round(cx) + 1, by - 18, 4 + wave, 2);
      }
      // tiles
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const t = grid[ty * cols + tx];
          if (t === Tile.Empty) continue;
          const f = hash(tx, ty) & 1;
          const px = tx * TILE, py = ty * TILE;
          switch (t) {
            case Tile.GroundTop: sp.draw(ctx, 'tile_ground_top', f, px, py); break;
            case Tile.Ground: sp.draw(ctx, 'tile_ground', f, px, py); break;
            case Tile.Rock: sp.draw(ctx, 'tile_rock', f, px, py); break;
            case Tile.Spike: sp.draw(ctx, 'tile_spike', 0, px, py); break;
            case Tile.Block: sp.draw(ctx, 'tile_block', 0, px, py); break;
            case Tile.BlockItem: sp.draw(ctx, 'tile_block_item', 0, px, py); break;
            case Tile.OneWay: sp.draw(ctx, 'tile_oneway', 0, px, py); break;
            default: break;
          }
        }
      }
    },
  };
  return level;
}
